"""Supervisor migration/recovery tests without network or ingestion."""

from contextlib import redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch, Mock
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ops.megabot_queue import supervisor as s
from ops.megabot_queue.queue import Queue


class StopAfterWait:
    def __init__(self, callback=None, count=1):
        self.stopped = False
        self.count = count
        self.callback = callback

    def is_set(self):
        return self.stopped

    def wait(self, seconds):
        if self.callback:
            self.callback()
        self.count -= 1
        if self.count <= 0:
            self.stopped = True


class FakeProcess:
    def __init__(self, pid):
        self.pid = pid
        self.code = None

    def poll(self):
        return self.code

    def terminate(self):
        self.code = -15

    def kill(self):
        self.code = -9

    def wait(self, timeout):
        if self.code is None:
            raise AssertionError('wait before termination in test')
        return self.code


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / 'state'
        self.source = self.root / 'source.py'
        self.source.write_text('class Config: pass\nclass MegaBot: pass\nclass MariaDB: pass\n')
        self.config = {'source_path': str(self.source), 'state_dir': str(self.state),
                       'expected_sha256': hashlib.sha256(self.source.read_bytes()).hexdigest(),
                       'env': {key: 'test-only-value' for key in (
                           'MEGABOT_DB_HOST', 'MEGABOT_DB_USER', 'MEGABOT_DB_NAME',
                           'MEGABOT_DB_PASSWORD', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY')}}
        self.config_path = self.root / 'config.json'
        s.atomic_json(self.config_path, self.config)
        self.lock_dir = self.root / 'locks'
        self.lock_dir.mkdir()

    def test_config_rejects_unapproved_environment_without_echoing_values(self):
        self.config['env']['PYTHONPATH'] = 'PRIVATE_SENTINEL_NEVER_PRINT'
        s.atomic_json(self.config_path, self.config)
        out = io.StringIO()
        with redirect_stdout(out):
            code = s.main(['check', '--config', str(self.config_path)])
        self.assertEqual(code, 1)
        self.assertNotIn('PRIVATE_SENTINEL', out.getvalue())
        self.assertNotIn('test-only-value', out.getvalue())

    def test_check_verifies_hash_before_source_execution(self):
        marker = self.root / 'executed'
        self.source.write_text(f'from pathlib import Path\nPath({str(marker)!r}).touch()\n')
        with self.assertRaises(s.SourceChanged):
            s.check(self.config)
        self.assertFalse(marker.exists())
        self.assertFalse(self.state.exists())

    def test_check_only_imports_and_reads_catalogue_without_creating_state(self):
        with patch.object(s, 'load_catalogue', return_value=['one', 'two']), \
             patch.object(s, 'legacy_processes', return_value=[12, 13]), \
             patch.object(s, 'spawn_worker') as spawn:
            result = s.check(self.config)
        self.assertEqual(result['eligible_handles'], 2)
        self.assertEqual(result['legacy_count'], 2)
        spawn.assert_not_called()
        self.assertFalse(self.state.exists())

    def test_legacy_detection_requires_script_name_and_exact_working_directory(self):
        proc = self.root / 'proc'
        proc.mkdir()
        legacy_dir = self.root / 'legacy'
        legacy_dir.mkdir()
        for pid, script, directory in [(10, 'megabot.py', legacy_dir),
                                       (11, '/opt/megabot/megabot.py', legacy_dir),
                                       (12, 'supervisor.py', legacy_dir),
                                       (13, 'megabot.py', self.root)]:
            item = proc / str(pid)
            item.mkdir()
            (item / 'cmdline').write_bytes(b'python\0' + script.encode() + b'\0')
            (item / 'cwd').symlink_to(directory)
        self.assertEqual(s.legacy_processes(proc, legacy_dir), [10, 11])

    def test_legacy_generation_prevents_all_claims_and_worker_starts(self):
        seen = []
        stop = StopAfterWait(lambda: seen.append(s.status(self.state)), count=2)
        with patch.object(s, 'load_catalogue', return_value=['a', 'b']), \
             patch.object(s, 'legacy_processes', return_value=[10, 11, 12, 13]), \
             patch.object(s, 'spawn_worker') as spawn, redirect_stdout(io.StringIO()):
            self.assertEqual(s.run_service(self.config_path, self.config, stop, self.lock_dir), 0)
        spawn.assert_not_called()
        self.assertTrue(all(item['phase'] == 'waiting_legacy' for item in seen))
        self.assertEqual(Queue(self.state / 'queue.sqlite3').stats(),
                         {'total': 2, 'pending': 2, 'active': 0, 'done': 0})

    def test_service_rejects_changed_source_before_activation(self):
        self.source.write_text('raise RuntimeError("PRIVATE_SENTINEL")\n')
        with patch.object(s, 'spawn_worker') as spawn, self.assertRaises(s.SourceChanged):
            s.run_service(self.config_path, self.config, StopAfterWait(), self.lock_dir)
        spawn.assert_not_called()
        self.assertFalse((self.state / 'queue.sqlite3').exists())

    def test_database_outage_cannot_start_or_skip_jobs(self):
        seen = []
        with patch.object(s, 'load_catalogue', side_effect=RuntimeError('PRIVATE_SENTINEL')), \
             patch.object(s, 'legacy_processes', return_value=[]), \
             patch.object(s, 'spawn_worker') as spawn, redirect_stdout(io.StringIO()) as out:
            s.run_service(self.config_path, self.config,
                          StopAfterWait(lambda: seen.append(s.status(self.state))), self.lock_dir)
        spawn.assert_not_called()
        self.assertEqual(seen[0]['phase'], 'paused_database')
        self.assertNotIn('PRIVATE_SENTINEL', out.getvalue())

    def test_worker_pool_lock_survives_parent_descriptor_close(self):
        path = self.lock_dir / 'pool.lock'
        fd = s.try_lock(path)
        child = subprocess.Popen([sys.executable, '-c',
            "import os,sys;os.write(1,b'ready');sys.stdin.buffer.read()"],
            pass_fds=(fd,), stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        try:
            self.assertEqual(child.stdout.read(5), b'ready')
            os.close(fd)
            fd = None
            self.assertIsNone(s.try_lock(path))
            child.stdin.close()
            child.wait(timeout=5)
            recovered = s.try_lock(path)
            self.assertIsNotNone(recovered)
            os.close(recovered)
        finally:
            if fd is not None:
                os.close(fd)
            if child.poll() is None:
                child.kill()
                child.wait()
            child.stdout.close()

    def test_cannot_recover_owned_jobs_while_old_pool_guard_is_held(self):
        queue = Queue(self.state / 'queue.sqlite3')
        queue.seed(['a'], 1)
        queue.claim('previous-process', 1)
        fd = s.try_lock(self.lock_dir / 'megabots-worker-pool.lock')
        try:
            with patch.object(s, 'spawn_worker') as spawn, redirect_stdout(io.StringIO()):
                s.run_service(self.config_path, self.config, StopAfterWait(), self.lock_dir)
            spawn.assert_not_called()
            self.assertEqual(queue.active_owners(), ['previous-process'])
        finally:
            os.close(fd)

    def test_disabled_slot_is_never_started_and_shutdown_releases_after_exit(self):
        self.state.mkdir()
        s.atomic_json(self.state / 'control.json', {'disabled_slots': [2]})
        started = []
        processes = []
        def spawn(config_path, config, worker, fd):
            started.append(worker['slot'])
            process = FakeProcess(1000 + worker['slot'])
            processes.append(process)
            return process
        with patch.object(s, 'load_catalogue', return_value=['a', 'b', 'c', 'd']), \
             patch.object(s, 'legacy_processes', return_value=[]), \
             patch.object(s, 'spawn_worker', side_effect=spawn), redirect_stdout(io.StringIO()):
            s.run_service(self.config_path, self.config, StopAfterWait(), self.lock_dir)
        self.assertEqual(started, [1, 3, 4])
        self.assertTrue(all(process.poll() is not None for process in processes))
        self.assertEqual(Queue(self.state / 'queue.sqlite3').stats()['active'], 0)
        self.assertEqual(s.status(self.state)['slots'][1]['state'], 'paused')

    def test_disable_running_slot_stops_it_before_releasing_its_job(self):
        observed = []
        processes = {}
        waits = [0]
        def on_wait():
            waits[0] += 1
            if waits[0] == 1:
                s.atomic_json(self.state / 'control.json', {'disabled_slots': [1]})
            else:
                observed.append(s.status(self.state))
                self.assertEqual(processes[1].poll(), -15)
        def spawn(config_path, config, worker, fd):
            process = FakeProcess(2000 + worker['slot'])
            processes[worker['slot']] = process
            return process
        with patch.object(s, 'load_catalogue', return_value=['a', 'b', 'c', 'd']), \
             patch.object(s, 'legacy_processes', return_value=[]), \
             patch.object(s, 'spawn_worker', side_effect=spawn), redirect_stdout(io.StringIO()):
            s.run_service(self.config_path, self.config, StopAfterWait(on_wait, 2), self.lock_dir)
        self.assertEqual(observed[0]['slots'][0]['state'], 'paused')
        self.assertEqual(observed[0]['queue']['active'], 3)
        self.assertEqual(observed[0]['queue']['pending'], 1)

    def test_storage_limit_pauses_the_whole_pool_without_completing_any_job(self):
        processes, owners, observed = {}, {}, []
        waits = [0]
        def spawn(config_path, config, worker, fd):
            processes[worker['slot']] = FakeProcess(3000 + worker['slot'])
            owners[worker['slot']] = worker['owner']
            return processes[worker['slot']]
        def on_wait():
            waits[0] += 1
            if waits[0] == 1:
                s.atomic_json(s.result_path(self.config, owners[1]), {'status': 'storage_full'})
                processes[1].code = 0
            else:
                observed.append(s.status(self.state))
        with patch.object(s, 'load_catalogue', return_value=['a', 'b', 'c', 'd']), \
             patch.object(s, 'legacy_processes', return_value=[]), \
             patch.object(s, 'spawn_worker', side_effect=spawn) as launch, redirect_stdout(io.StringIO()):
            s.run_service(self.config_path, self.config, StopAfterWait(on_wait, 2), self.lock_dir)
        self.assertEqual(launch.call_count, 4)
        self.assertEqual(observed[0]['phase'], 'storage_paused')
        self.assertEqual(observed[0]['pause_kind'], 'storage')
        self.assertTrue(all(process.poll() is not None for process in processes.values()))
        self.assertEqual(observed[0]['queue'], {'total': 4, 'pending': 4, 'active': 0, 'done': 0})
        self.assertGreaterEqual(observed[0]['pause_until'] - observed[0]['updated_at'], 299)

    def test_network_failure_blocks_new_claims_keeps_healthy_workers_and_survives_restart(self):
        processes, owners, observed = {}, {}, []
        waits = [0]
        def spawn(config_path, config, worker, fd):
            processes[worker['slot']] = FakeProcess(5000 + worker['slot'])
            owners[worker['slot']] = worker['owner']
            return processes[worker['slot']]
        def on_wait():
            waits[0] += 1
            if waits[0] == 1:
                s.atomic_json(s.result_path(self.config, owners[1]),
                              {'status': 'retry', 'reason': 'request_or_json_failed'})
                processes[1].code = 0
            else:
                observed.append(s.status(self.state))
                self.assertTrue(all(processes[slot].poll() is None for slot in (2, 3, 4)))
        with patch.object(s, 'load_catalogue', return_value=list('abcdefghij')), \
             patch.object(s, 'legacy_processes', return_value=[]), \
             patch.object(s, 'spawn_worker', side_effect=spawn) as launch, \
             patch.object(s.time, 'time', return_value=1000), redirect_stdout(io.StringIO()):
            s.run_service(self.config_path, self.config, StopAfterWait(on_wait, 3), self.lock_dir)
        self.assertEqual(launch.call_count, 4)
        self.assertTrue(all(item['phase'] == 'network_paused' for item in observed))
        self.assertTrue(all(item['queue']['active'] == 3 and item['queue']['pending'] == 7 for item in observed))
        self.assertEqual(observed[0]['pause_kind'], 'network')
        self.assertEqual(observed[0]['pause_until'], 1060)
        self.assertEqual(s.status(self.state)['pause_kind'], 'network')
        restarted = []
        with patch.object(s, 'load_catalogue', return_value=list('abcdefghij')), \
             patch.object(s, 'legacy_processes', return_value=[]), \
             patch.object(s, 'spawn_worker') as launch, \
             patch.object(s.time, 'time', return_value=1020), redirect_stdout(io.StringIO()):
            s.run_service(self.config_path, self.config,
                          StopAfterWait(lambda: restarted.append(s.status(self.state))), self.lock_dir)
        launch.assert_not_called()
        self.assertEqual(restarted[0]['phase'], 'network_paused')
        self.assertEqual(restarted[0]['pause_until'], 1060)
        self.assertEqual(s.status(self.state)['pause_kind'], 'network')

    def test_media_specific_failure_does_not_pause_other_ready_profiles(self):
        processes, owners, observed = {}, {}, []
        waits = [0]
        def spawn(config_path, config, worker, fd):
            processes[worker['slot']] = FakeProcess(6000 + worker['slot'])
            owners[worker['slot']] = worker['owner']
            return processes[worker['slot']]
        def on_wait():
            waits[0] += 1
            if waits[0] == 1:
                s.atomic_json(s.result_path(self.config, owners[1]),
                              {'status': 'retry', 'reason': 'invalid_media_id'})
                processes[1].code = 0
            else:
                observed.append(s.status(self.state))
        with patch.object(s, 'load_catalogue', return_value=list('abcdefghij')), \
             patch.object(s, 'legacy_processes', return_value=[]), \
             patch.object(s, 'spawn_worker', side_effect=spawn) as launch, \
             patch.object(s.time, 'time', return_value=1000), redirect_stdout(io.StringIO()):
            s.run_service(self.config_path, self.config, StopAfterWait(on_wait, 2), self.lock_dir)
        self.assertEqual(launch.call_count, 5)
        self.assertEqual(observed[0]['phase'], 'running')
        self.assertEqual(observed[0]['queue']['active'], 4)
        self.assertIsNone(observed[0]['pause_kind'])

    def test_status_write_failure_still_stops_children(self):
        processes = []
        def spawn(config_path, config, worker, fd):
            process = FakeProcess(4000 + worker['slot'])
            processes.append(process)
            return process
        with patch.object(s, 'load_catalogue', return_value=['a']), \
             patch.object(s, 'legacy_processes', return_value=[]), \
             patch.object(s, 'spawn_worker', side_effect=spawn), \
             patch.object(s, 'phase', side_effect=OSError('disk full')), redirect_stdout(io.StringIO()):
            with self.assertRaises(OSError):
                s.run_service(self.config_path, self.config, StopAfterWait(), self.lock_dir)
        self.assertEqual(processes[0].poll(), -15)
        self.assertEqual(Queue(self.state / 'queue.sqlite3').stats()['active'], 0)

    def test_stop_does_not_release_before_process_exit(self):
        process = FakeProcess(12)
        workers = {1: {'process': process, 'owner': 'owner'}}
        queue = Mock()
        queue.release_owner.side_effect = lambda *args: self.assertIsNotNone(process.poll())
        s.stop_workers(queue, workers)
        queue.release_owner.assert_called_once()
        self.assertEqual(workers, {})

    def test_continue_storage_and_retry_preserve_checkpoint_and_are_not_done(self):
        for outcome in ('continue', 'storage_full', 'retry'):
            with self.subTest(outcome=outcome):
                queue = Queue(self.root / (outcome + '.sqlite3'))
                queue.seed(['a'], 1)
                owner = str(uuid.uuid4())
                queue.claim(owner, 1)
                queue.checkpoint('a', owner, 7, 1)
                s.finish_job(queue, {'handle': 'a', 'owner': owner}, {'status': outcome}, 2)
                self.assertEqual(queue.stats()['done'], 0)
                job = queue.claim('replacement', 4000)
                self.assertEqual((job['next_page'], job['empty_streak']), (7, 1))

    def test_invalid_control_fails_closed_and_status_is_read_only_and_sanitized(self):
        self.assertEqual(s.status(self.state)['phase'], 'unknown')
        self.assertFalse(self.state.exists())
        self.state.mkdir()
        s.atomic_json(self.state / 'control.json', {'disabled_slots': [8]})
        self.assertEqual(s.read_control(self.state), {1, 2, 3, 4})
        s.atomic_json(self.state / 'status.json', {'phase': 'running', 'env': 'PRIVATE_SENTINEL',
            'slots': [{'slot': 1, 'handle': 'https://host/?key=PRIVATE_SENTINEL', 'state': 'running'}]})
        self.assertNotIn('PRIVATE_SENTINEL', json.dumps(s.status(self.state)))
        self.assertFalse((self.state / 'queue.sqlite3').exists())

    def test_result_reasons_are_whitelisted_and_unavailable_counts_are_preserved(self):
        (self.state / 'results').mkdir(parents=True)
        owner = str(uuid.uuid4())
        for reason in ['http_403', 'http_503', 'pagination_limit', 'request_or_json_failed']:
            s.atomic_json(s.result_path(self.config, owner),
                          {'status': 'retry', 'reason': reason, 'unavailable_skipped': 2})
            self.assertEqual(s.read_result(self.config, owner),
                             {'status': 'retry', 'reason': reason, 'unavailable_skipped': 2})
        s.atomic_json(s.result_path(self.config, owner),
                      {'status': 'retry', 'reason': 'http_503?token=PRIVATE_SENTINEL',
                       'url': 'https://host/PRIVATE_SENTINEL'})
        self.assertEqual(s.read_result(self.config, owner), {'status': 'retry'})


if __name__ == '__main__':
    unittest.main()
