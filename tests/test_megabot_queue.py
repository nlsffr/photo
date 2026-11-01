"""Isolated SQLite queue tests; no network, credentials or production services."""

import multiprocessing
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ops.megabot_queue.queue import OwnershipError, Queue, REFRESH_SECONDS


def claim_ten(path, owner, barrier, output):
    queue = Queue(path)
    barrier.wait(timeout=15)
    output.put([queue.claim(owner, 1000)['handle'] for _ in range(10)])


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'queue.sqlite3'
        self.queue = Queue(self.path)

    def test_seed_freezes_priority_and_does_not_reset_existing_jobs(self):
        self.assertEqual(self.queue.seed(['a', 'b', 'c', 'd', 'e'], 1000, start_index=3), 5)
        self.assertEqual(self.queue.seed(['E', 'D', 'f'], 1001, start_index=0), 1)
        self.assertEqual([self.queue.claim('owner', 1001)['handle'] for _ in range(6)],
                         ['d', 'e', 'a', 'b', 'c', 'f'])
        self.assertEqual(self.queue.stats(), {'total': 6, 'pending': 0, 'active': 6, 'done': 0})

    def test_four_processes_cannot_claim_the_same_job(self):
        self.queue.seed([f'handle-{i}' for i in range(40)], 1000, start_index=0)
        ctx = multiprocessing.get_context('spawn')
        barrier, output = ctx.Barrier(4), ctx.Queue()
        workers = [ctx.Process(target=claim_ten, args=(str(self.path), str(i), barrier, output))
                   for i in range(4)]
        try:
            for worker in workers:
                worker.start()
            results = [output.get(timeout=25) for _ in workers]
            for worker in workers:
                worker.join(timeout=10)
                self.assertEqual(worker.exitcode, 0)
            handles = [handle for result in results for handle in result]
            self.assertEqual(len(handles), 40)
            self.assertEqual(len(set(handles)), 40)
            self.assertEqual(self.queue.stats()['active'], 40)
        finally:
            for worker in workers:
                if worker.is_alive():
                    worker.terminate()
                worker.join(timeout=10)
            output.close()
            output.join_thread()

    def test_owner_is_required_for_every_job_mutation(self):
        self.queue.seed(['a'], 10)
        self.queue.claim('owner', 10)
        for action in [lambda: self.queue.checkpoint('a', 'other', 7, 1),
                       lambda: self.queue.complete('a', 'other', 11),
                       lambda: self.queue.fail('a', 'other', 11)]:
            with self.assertRaises(OwnershipError):
                action()
        self.assertEqual(self.queue.release_owner('other', 12), 0)
        self.assertEqual(self.queue.stats()['active'], 1)

    def test_checkpoint_survives_reopen_and_explicit_crash_recovery(self):
        self.queue.seed(['a'], 10)
        self.queue.claim('old-process', 10)
        self.queue.checkpoint('a', 'old-process', 19, 1)
        reopened = Queue(self.path)
        self.assertIsNone(reopened.claim('new-process', 10 + 20 * REFRESH_SECONDS))
        self.assertEqual(reopened.release_owner('old-process', 20), 1)
        self.assertEqual(reopened.claim('new-process', 20),
                         {'handle': 'a', 'next_page': 19, 'empty_streak': 1, 'attempts': 2})
        with self.assertRaises(OwnershipError):
            reopened.complete('a', 'old-process', 21)

    def test_failure_retries_with_checkpoint_and_never_marks_done(self):
        self.queue.seed(['a'], 10)
        self.queue.claim('owner', 10)
        self.queue.checkpoint('a', 'owner', 12, 0)
        now = 10
        delays = []
        for attempt in range(1, 10):
            ready = self.queue.fail('a', 'owner', now)
            delays.append(ready - now)
            self.assertIsNone(self.queue.claim('owner', ready - 0.1))
            job = self.queue.claim('owner', ready)
            self.assertEqual(job['next_page'], 12)
            self.assertEqual(job['attempts'], attempt + 1)
            self.assertEqual(self.queue.stats()['done'], 0)
            now = ready
        self.assertEqual(delays, [60, 120, 240, 480, 960, 1920, 3600, 3600, 3600])

    def test_backoff_counts_consecutive_failures_not_successful_chunks(self):
        self.queue.seed(['a'], 10)
        for chunk in range(20):
            self.queue.claim('owner', 10)
            self.queue.checkpoint('a', 'owner', chunk + 2, 0)
            self.queue.release_owner('owner', 10)
        job = self.queue.claim('owner', 10)
        self.assertEqual(job['attempts'], 21)
        first = self.queue.fail('a', 'owner', 10)
        self.assertEqual(first - 10, 60)
        self.queue.claim('owner', first)
        second = self.queue.fail('a', 'owner', first)
        self.assertEqual(second - first, 120)
        self.queue.claim('owner', second)
        self.queue.checkpoint('a', 'owner', 22, 0)
        self.assertEqual(self.queue.fail('a', 'owner', second) - second, 60)

    def test_existing_schema_gains_failure_counter_without_resetting_jobs(self):
        old = Path(self.temp.name) / 'old.sqlite3'
        with sqlite3.connect(old) as db:
            db.execute('''CREATE TABLE jobs (handle TEXT PRIMARY KEY, priority INTEGER,
                state TEXT, owner TEXT, next_page INTEGER, empty_streak INTEGER,
                attempts INTEGER, available_at REAL)''')
            db.execute("INSERT INTO jobs VALUES ('a',0,'pending',NULL,17,1,23,10)")
        queue = Queue(old)
        self.assertEqual(queue.claim('new-owner', 10),
                         {'handle': 'a', 'next_page': 17, 'empty_streak': 1, 'attempts': 24})
        self.assertEqual(queue.fail('a', 'new-owner', 10), 70)
        # Opening again is idempotent, including the newly added column.
        self.assertEqual(Queue(old).stats()['pending'], 1)

    def test_refresh_after_24_hours_resets_cursor_and_prioritizes_unfinished_jobs(self):
        self.queue.seed(['a', 'b'], 10, start_index=0)
        self.queue.claim('owner', 10)
        self.queue.checkpoint('a', 'owner', 42, 2)
        self.queue.complete('a', 'owner', 20)
        self.assertEqual(self.queue.claim('other', 20 + REFRESH_SECONDS)['handle'], 'b')
        self.assertIsNone(self.queue.claim('early', 19 + REFRESH_SECONDS))
        self.assertEqual(self.queue.claim('refresh', 20 + REFRESH_SECONDS),
                         {'handle': 'a', 'next_page': 1, 'empty_streak': 0, 'attempts': 1})

    def test_invalid_inputs_do_not_change_the_queue(self):
        for handles in [[''], ['   '], [None]]:
            with self.assertRaises(ValueError):
                self.queue.seed(handles, 1)
        with self.assertRaises(ValueError):
            self.queue.seed(['a'], float('nan'))
        with self.assertRaises(ValueError):
            self.queue.claim('', 1)
        self.assertEqual(self.queue.stats()['total'], 0)


if __name__ == '__main__':
    unittest.main()
