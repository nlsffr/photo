import multiprocessing
from pathlib import Path
import queue
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from ops.megabot_queue import adapter


def _lock_process(directory, entered, attempting, release):
    attempting.set()
    with adapter.media_lock(directory, "same-id"):
        entered.put(True)
        release.wait(5)


def source_fixture(pages=None, details=None, *, active=True, stored=0, fail_media=False, remove_before_publish=False):
    state = SimpleNamespace(active=active, stored=stored, inserted=set(), requests=[],
                            checkpoints=[], closed=False, commits=0, rollbacks=0,
                            transaction=False, statements=[], processing=0)
    class Cursor:
        def execute(self, sql, params):
            state.statements.append((sql, params))
        def fetchone(self):
            return ("creator-id",) if state.active else None
        def close(self):
            pass
    class Connection:
        def cursor(self):
            return Cursor()
        def start_transaction(self):
            state.transaction = True
        def is_connected(self):
            return True
        def commit(self):
            state.commits += 1
            state.transaction = False
        def rollback(self):
            state.rollbacks += 1
            state.transaction = False
    class Database:
        def __init__(self):
            self.conn = Connection()
        def _ensure(self):
            pass
        def already_ingested(self, source_id):
            return source_id in state.inserted
        def total_storage_bytes(self):
            return state.stored
        def insert_photo(self, photo_id, creator_id, source_id):
            self._ensure()
            assert state.transaction
            state.inserted.add(source_id)
        def close(self):
            state.closed = True
    class Session:
        def get(self, url, **kwargs):
            state.requests.append(url)
            if "/profile/" in url:
                value = (pages or {}).get(int(url.rsplit("/", 1)[1]), [])
            else:
                value = (details or {}).get(url.rsplit("/", 1)[1], {})
            if isinstance(value, Exception):
                raise value
            if isinstance(value, int):
                return SimpleNamespace(status_code=value, json=lambda: {})
            return SimpleNamespace(status_code=200, json=lambda: value)
        def close(self):
            pass
    class MegaBot:
        def __init__(self):
            self.db = Database()
            self.session = Session()
            self.total_new = self.total_skipped = self.total_errors = 0
        def get_proxy(self):
            return None
        def process_post(self, post):
            source_id = str(post['id'])
            if self.db.already_ingested(source_id):
                self.total_skipped += 1
                return
            details_value = self.fetch_details(source_id)
            state.processing += 1
            if fail_media:
                self.total_errors += 1
                return
            owner = {**post, **details_value}.get('handle', '')
            if remove_before_publish:
                state.active = False
            try:
                creator_id = self.db.upsert_creator(owner)
                self.db.insert_photo('photo-id', creator_id, source_id)
            except Exception:
                self.total_errors += 1
            else:
                self.total_new += 1
    source = SimpleNamespace(
        Config=SimpleNamespace(BASE_URL='https://fixture.invalid', DOWNLOAD_DIR=Path('/unused'),
                               DETAILS_DELAY=0, DELAY_MIN=0, DELAY_MAX=0, MAX_STORAGE_TB=1),
        MegaBot=MegaBot, extract_handle=lambda post: post.get('handle', ''),
    )
    return source, state


class AdapterTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)

    def run_fixture(self, source, state, **kwargs):
        with patch.object(adapter, 'load_source', return_value=source):
            return adapter.run_profile(
                'allowed', checkpoint=lambda page, empty: state.checkpoints.append((page, empty)),
                download_dir=Path(self.directory.name) / 'worker',
                lock_dir=Path(self.directory.name) / 'locks', **kwargs,
            )

    def test_ingestion_checkpoints_and_two_confirmed_empty_pages(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}], 2: {'medias': []}, 3: 404})
        result = self.run_fixture(source, state)
        self.assertEqual(result['status'], 'done')
        self.assertEqual(result['new'], 1)
        self.assertEqual(state.checkpoints, [(2, 0), (3, 1), (4, 2)])
        self.assertEqual(sum('/media/1' in url for url in state.requests), 1)
        self.assertEqual(state.commits, 1)
        self.assertTrue(state.closed)
        self.assertFalse(any('INSERT INTO creators' in sql for sql, _ in state.statements))

    def test_network_status_and_malformed_responses_are_not_empty_pages(self):
        for value in [TimeoutError('secret-url'), 403, 429, 503, {'error': 'unavailable'}, ['not-a-post']]:
            with self.subTest(value=type(value).__name__):
                source, state = source_fixture({1: value})
                with self.assertRaises(adapter.RetryableError) as error:
                    self.run_fixture(source, state)
                self.assertNotIn('secret-url', str(error.exception))
                self.assertEqual(state.checkpoints, [])
                self.assertTrue(state.closed)

    def test_details_failure_does_not_publish_or_advance(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]}, {'1': 503})
        with self.assertRaises(adapter.RetryableError):
            self.run_fixture(source, state)
        self.assertFalse(state.inserted)
        self.assertEqual(state.checkpoints, [])

    def test_profile_application_errors_do_not_publish_or_complete(self):
        payloads = [
            {'medias': [], 'error': {'reason': 'temporarily_unavailable'}},
            {'data': [], 'errors': [{'reason': 'retry_later'}]},
            {'posts': [{'id': '1', 'handle': 'allowed'}], 'error': 'partial_response'},
        ]
        for payload in payloads:
            with self.subTest(error_field='errors' if 'errors' in payload else 'error'):
                source, state = source_fixture({1: payload, 2: payload})
                with self.assertRaisesRegex(adapter.RetryableError, 'invalid_profile_page'):
                    self.run_fixture(source, state)
                self.assertEqual(state.checkpoints, [])
                self.assertFalse(state.inserted)
                self.assertEqual(state.processing, 0)
                self.assertTrue(state.closed)

    def test_empty_error_markers_do_not_reject_confirmed_empty_pages(self):
        empty = {'medias': [], 'error': None, 'errors': []}
        source, state = source_fixture({1: empty, 2: empty})
        result = self.run_fixture(source, state)
        self.assertEqual(result['status'], 'done')
        self.assertEqual(state.checkpoints, [(2, 1), (3, 2)])

    def test_missing_details_skip_without_processing_or_publication(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]}, {'1': 404})
        with patch.object(source.MegaBot, 'process_post', side_effect=AssertionError('missing media must not be processed')) as process:
            result = self.run_fixture(source, state)
        process.assert_not_called()
        self.assertEqual((result['status'], result['new'], result['skipped'], result['unavailable_skipped']), ('done', 0, 1, 1))
        self.assertFalse(state.inserted)
        self.assertEqual(state.processing, 0)
        self.assertEqual(state.checkpoints, [(2, 0), (3, 1), (4, 2)])

    def test_missing_details_do_not_prevent_other_media_on_page(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}, {'id': '2', 'handle': 'allowed'}]}, {'1': 404})
        result = self.run_fixture(source, state)
        self.assertEqual((result['new'], result['skipped']), (1, 1))
        self.assertEqual(result['unavailable_skipped'], 1)
        self.assertEqual(state.inserted, {'2'})
        self.assertEqual(state.processing, 1)
        self.assertEqual(state.checkpoints[0], (2, 0))

    def test_empty_streak_survives_bounded_invocations(self):
        source, state = source_fixture({1: []})
        result = self.run_fixture(source, state, max_pages=1)
        self.assertEqual((result['status'], result['next_page'], result['empty_streak']), ('continue', 2, 1))
        result = self.run_fixture(source, state, next_page=2, empty_streak=1)
        self.assertEqual(result['status'], 'done')
        self.assertEqual(state.checkpoints, [(2, 1), (3, 2)])

    def test_ten_pages_yield_without_reaching_completion(self):
        source, state = source_fixture({n: [{'id': str(n), 'handle': 'allowed'}] for n in range(1, 12)})
        result = self.run_fixture(source, state)
        self.assertEqual((result['status'], result['next_page'], result['new']), ('continue', 11, 10))
        self.assertEqual(len(state.checkpoints), 10)

    def test_excluded_and_storage_limit_do_not_fetch(self):
        for settings, exception in [({'active': False}, adapter.Excluded), ({'stored': 1024**4}, adapter.StorageFull)]:
            source, state = source_fixture(**settings)
            with self.assertRaises(exception):
                self.run_fixture(source, state)
            self.assertEqual(state.requests, [])
            self.assertEqual(state.checkpoints, [])

    def test_cross_profile_media_and_duplicates_are_not_reimported(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}, {'id': '2', 'handle': 'another'}]})
        state.inserted.add('1')
        result = self.run_fixture(source, state)
        self.assertEqual((result['new'], result['skipped'], result['foreign_skipped']), (0, 2, 1))
        self.assertEqual(state.processing, 0)
        self.assertFalse(any('/media/1' in url for url in state.requests))

    def test_failed_media_does_not_advance_the_page(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]}, fail_media=True)
        with self.assertRaisesRegex(adapter.RetryableError, 'media_processing_failed'):
            self.run_fixture(source, state)
        self.assertEqual(state.checkpoints, [])

    def test_removal_during_processing_prevents_publication(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]}, remove_before_publish=True)
        with self.assertRaises(adapter.Excluded):
            self.run_fixture(source, state)
        self.assertFalse(state.inserted)
        self.assertEqual(state.checkpoints, [])

    def test_previous_successful_page_survives_next_page_failure(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}], 2: 503})
        with self.assertRaises(adapter.RetryableError):
            self.run_fixture(source, state)
        self.assertEqual(state.checkpoints, [(2, 0)])
        self.assertEqual(state.inserted, {'1'})

    def test_conflicting_arrays_are_not_misreported_as_empty(self):
        source, state = source_fixture({1: {'medias': [], 'posts': [{'id': '1', 'handle': 'allowed'}]}})
        with self.assertRaisesRegex(adapter.RetryableError, 'ambiguous_profile_page'):
            self.run_fixture(source, state)
        self.assertEqual(state.checkpoints, [])

    def test_pagination_ceiling_is_an_error_not_completion(self):
        source, state = source_fixture({200: [{'id': '1', 'handle': 'allowed'}]})
        with self.assertRaisesRegex(adapter.RetryableError, 'pagination_limit'):
            self.run_fixture(source, state, next_page=201)
        self.assertEqual(state.requests, [])
        with self.assertRaisesRegex(adapter.RetryableError, 'pagination_limit'):
            self.run_fixture(source, state, next_page=200)
        self.assertEqual(state.checkpoints, [(201, 0)])
        self.assertFalse(any('/201' in url for url in state.requests))

    def test_source_id_cannot_escape_download_directory(self):
        source, state = source_fixture({1: [{'id': '../../secret', 'handle': 'allowed'}]})
        with self.assertRaisesRegex(adapter.RetryableError, 'invalid_media_id'):
            self.run_fixture(source, state)
        self.assertEqual(state.processing, 0)

    def test_database_eligibility_is_locked_until_publication(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]})
        self.run_fixture(source, state)
        self.assertTrue(any('FOR UPDATE' in sql for sql, _ in state.statements))
        self.assertEqual(state.commits, 1)
        self.assertEqual(state.rollbacks, 0)

    def test_publication_failure_rolls_back_and_restores_connection_guard(self):
        source, state = source_fixture()
        original = source.MegaBot().db
        ensure = original._ensure
        guarded = adapter.EligibleDatabase(original, 'allowed')
        with patch.object(original, 'insert_photo', side_effect=RuntimeError('database failed')):
            with self.assertRaises(RuntimeError):
                guarded.insert_photo('photo-id', 'creator-id', '1')
        self.assertEqual(state.rollbacks, 1)
        self.assertEqual(state.commits, 0)
        self.assertEqual(original._ensure, ensure)

    def test_two_processes_cannot_process_same_media_concurrently(self):
        context = multiprocessing.get_context('spawn')
        entered = [context.Queue(), context.Queue()]
        attempting = [context.Event(), context.Event()]
        release = [context.Event(), context.Event()]
        children = [context.Process(target=_lock_process, args=(self.directory.name, entered[i], attempting[i], release[i])) for i in range(2)]
        try:
            children[0].start()
            self.assertTrue(entered[0].get(timeout=5))
            children[1].start()
            self.assertTrue(attempting[1].wait(5))
            with self.assertRaises(queue.Empty):
                entered[1].get(timeout=.2)
            release[0].set()
            self.assertTrue(entered[1].get(timeout=5))
            release[1].set()
            for child in children:
                child.join(5)
                self.assertEqual(child.exitcode, 0)
        finally:
            for child in children:
                if child.is_alive():
                    child.terminate()
                    child.join(5)
            for result in entered:
                result.close()


if __name__ == '__main__':
    unittest.main()
