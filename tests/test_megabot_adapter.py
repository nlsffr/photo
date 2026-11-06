import fcntl
import hashlib
import multiprocessing
from contextlib import contextmanager
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from ops.megabot_queue import adapter


def _legacy_lock_process(directory, acquired, release):
    stripe = int.from_bytes(hashlib.sha256(b"same-id").digest()[:2], "big") % 64
    with (Path(directory) / f"media-{stripe:02d}.lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        acquired.set()
        release.wait(15)


def _current_lock_process(directory, acquired, release):
    with adapter.media_lock(directory, 'same-id'):
        acquired.set()
        release.wait(15)


def source_fixture(pages=None, details=None, *, active=True, stored=0, fail_media=False, remove_before_publish=False,
                   notice_before_publish=False, capped=False, cap_before_insert=False):
    state = SimpleNamespace(active=active, stored=stored, inserted=set(), requests=[],
                            checkpoints=[], closed=False, commits=0, rollbacks=0,
                            transaction=False, statements=[], processing=0, notices=[], publication_checks=0,
                            processed_details=[], capped=capped)
    class Cursor:
        def execute(self, sql, params=()):
            self.sql = sql
            state.statements.append((sql, params))
        def fetchone(self):
            if state.capped and "creator_import_caps" in self.sql:
                return None
            return ("creator-id",) if state.active else None
        def close(self):
            pass
        def fetchall(self):
            return state.notices
    class Connection:
        def cursor(self, **kwargs):
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
        def insert_photo(self, photo_id, creator_id, source_id, *args):
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
                if isinstance(value, dict):
                    value = {'id': url.rsplit('/', 1)[1], 'handle': 'allowed',
                             'is_video': False, 'file_path': 'neutral.jpg', **value}
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
            self.r2 = SimpleNamespace(client=None, bucket='fixture')
        def get_proxy(self):
            return None
        def process_post(self, post):
            source_id = str(post['id'])
            if self.db.already_ingested(source_id):
                self.total_skipped += 1
                return
            details_value = self.fetch_details(source_id)
            state.processed_details.append(details_value)
            state.processing += 1
            if fail_media:
                self.total_errors += 1
                return
            owner = {**post, **details_value}.get('handle', '')
            if remove_before_publish:
                state.active = False
            if notice_before_publish:
                state.notices = [{'urls': 'https://leakfanhub.com/allowed/' + source_id}]
            try:
                creator_id = self.db.upsert_creator(owner)
                if cap_before_insert:
                    state.capped = True
                self.db.insert_photo('photo-id', creator_id, source_id, 'title', 'image-url', None, 'photo',
                                     [], 0, 0, 8, 8, None, False, 1, owner, 'image-key')
            except Exception:
                self.total_errors += 1
            else:
                self.total_new += 1
    source = SimpleNamespace(
        Config=SimpleNamespace(BASE_URL='https://fixture.invalid', DOWNLOAD_DIR=Path('/unused'),
                               DETAILS_DELAY=0, DELAY_MIN=0, DELAY_MAX=0, MAX_STORAGE_TB=1,
                               PUBLIC_MEDIA_BASE='https://fixture.invalid/media'),
        MegaBot=MegaBot, extract_handle=lambda post: post.get('handle', ''),
    )
    return source, state


class AdapterTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)

    def run_fixture(self, source, state, **kwargs):
        def verified(*_):
            state.publication_checks += 1
        with patch.object(adapter, 'load_source', return_value=source), \
             patch.object(adapter.integrity.VerifiedStorage, 'verify_publication', side_effect=verified):
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

    def test_ordinary_worker_skips_capped_profile_without_fetching(self):
        source, state = source_fixture(capped=True)
        with self.assertRaises(adapter.Excluded):
            self.run_fixture(source, state)
        self.assertEqual(state.requests, [])
        self.assertEqual(state.checkpoints, [])

    def test_ordinary_worker_rechecks_cap_under_insert_lock(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]}, cap_before_insert=True)
        with self.assertRaises(adapter.Excluded):
            self.run_fixture(source, state)
        self.assertFalse(state.inserted)
        self.assertEqual(state.commits, 0)
        self.assertEqual(state.rollbacks, 1)
        self.assertTrue(any('creator_import_caps' in sql and sql.endswith('FOR UPDATE')
                            for sql, _ in state.statements))

    def test_already_imported_media_skip_a_busy_stripe_without_new_io(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]})
        state.inserted.add('1')
        with patch.object(adapter, 'media_lock', side_effect=AssertionError('known media must not wait')):
            result = self.run_fixture(source, state, max_pages=1)
        self.assertEqual((result['new'], result['skipped']), (0, 1))
        self.assertEqual(state.checkpoints, [(2, 0)])
        self.assertEqual(state.processing, 0)
        self.assertEqual(state.commits, 0)
        self.assertFalse(any('/media/' in url for url in state.requests))

    def test_media_published_while_waiting_for_lock_is_rechecked(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]})
        real_lock = adapter.media_lock

        @contextmanager
        def published_before_lock(directory, source_id):
            state.inserted.add(source_id)
            with real_lock(directory, source_id):
                yield

        with patch.object(adapter, 'media_lock', new=published_before_lock):
            result = self.run_fixture(source, state, max_pages=1)
        self.assertEqual((result['new'], result['skipped']), (0, 1))
        self.assertEqual(state.checkpoints, [(2, 0)])
        self.assertEqual(state.processing, 0)
        self.assertEqual(state.commits, 0)
        self.assertFalse(any('/media/' in url for url in state.requests))

    def test_already_imported_media_still_requires_eligible_profile(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]})
        state.inserted.add('1')
        real_check = adapter.EligibleDatabase.eligible_id

        def withdraw_after_page_fetch(database, **kwargs):
            if state.requests:
                state.active = False
            return real_check(database, **kwargs)

        with patch.object(adapter.EligibleDatabase, 'eligible_id', new=withdraw_after_page_fetch):
            with self.assertRaisesRegex(adapter.Excluded, 'profile_excluded'):
                self.run_fixture(source, state, max_pages=1)
        self.assertEqual(state.checkpoints, [])
        self.assertEqual(state.commits, 0)

    def test_cap_counts_successes_and_leaves_partial_page_uncheckpointed(self):
        source, state = source_fixture({
            1: [{'id': str(i), 'handle': 'allowed'} for i in range(1, 5)],
        })
        state.inserted.add('1')
        result = self.run_fixture(source, state, max_new=2)
        self.assertEqual((result['status'], result['new'], result['skipped']), ('capped', 2, 1))
        self.assertEqual((result['next_page'], result['empty_streak']), (1, 0))
        self.assertEqual(state.checkpoints, [])
        self.assertEqual(state.inserted, {'1', '2', '3'})
        self.assertEqual(state.commits, 2)
        self.assertFalse(any('/media/4' in url for url in state.requests))

    def test_factory_wraps_original_database_and_cap_preserves_finished_page(self):
        source, state = source_fixture({
            1: [{'id': '1', 'handle': 'allowed'}],
            2: [{'id': '2', 'handle': 'allowed'}],
        })
        factory = Mock(side_effect=adapter.EligibleDatabase)
        result = self.run_fixture(source, state, max_new=2, database_factory=factory)
        self.assertEqual(result['status'], 'capped')
        self.assertEqual(state.checkpoints, [(2, 0)])
        factory.assert_called_once()
        original, handle, storage = factory.call_args.args
        self.assertEqual(handle, 'allowed')
        self.assertIsInstance(storage, adapter.integrity.VerifiedStorage)
        self.assertTrue(original.already_ingested('2'))

    def test_invalid_cap_or_factory_fails_before_loading_source(self):
        for options in ({'max_new': 0}, {'max_new': -1}, {'max_new': True},
                        {'max_new': 1.5}, {'database_factory': object()}):
            with self.subTest(options=options), patch.object(adapter, 'load_source') as load_source:
                with self.assertRaises(ValueError):
                    adapter.run_profile('allowed', checkpoint=lambda *_: None, **options)
                load_source.assert_not_called()

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

    def test_details_identity_mismatch_does_not_publish_or_advance(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]}, {'1': {'id': 'other'}})
        with self.assertRaisesRegex(adapter.RetryableError, 'details_identity_mismatch'):
            self.run_fixture(source, state)
        self.assertFalse(state.inserted)
        self.assertEqual(state.checkpoints, [])

    def test_new_media_with_withdrawal_is_skipped_before_details_or_publication(self):
        for notice in [{'urls': 'https://leakfanhub.com/fr/allowed/1-v3'},
                       {'targets': [{'kind': 'creator', 'id': 'creator-id'}]}]:
            source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]})
            state.notices = [notice]
            result = self.run_fixture(source, state)
            self.assertEqual(result['notice_skipped'], 1)
            self.assertFalse(state.inserted)
            self.assertEqual(state.processing, 0)
            self.assertFalse(any('/media/' in url for url in state.requests))

    def test_notice_arriving_before_insert_rolls_back_without_advancing_as_error(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]}, notice_before_publish=True)
        result = self.run_fixture(source, state)
        self.assertEqual(result['notice_skipped'], 1)
        self.assertEqual(result['errors'], 0)
        self.assertFalse(state.inserted)
        self.assertEqual(state.commits, 0)
        self.assertEqual(state.rollbacks, 1)

    def test_source_false_string_and_unchecked_thumbnail_are_normalized(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]},
                                       {'1': {'is_video': 'false', 'thumbnail_path': 'bad.mp4'}})
        self.run_fixture(source, state)
        self.assertIs(state.processed_details[0]['is_video'], False)
        self.assertEqual(state.processed_details[0]['thumbnail_path'], '')
        self.assertEqual(state.publication_checks, 1)

    def test_unverified_storage_blocks_sql_transaction(self):
        source, state = source_fixture()
        original = source.MegaBot().db
        store = SimpleNamespace(verify_publication=Mock(side_effect=adapter.integrity.InvalidMedia('missing')))
        guarded = adapter.EligibleDatabase(original, 'allowed', store)
        with self.assertRaisesRegex(adapter.RetryableError, 'publication_assets_not_verified'):
            guarded.insert_photo('uuid', 'creator-id', '1', 'title', 'image', None, 'photo',
                                 [], 0, 0, 8, 8, None, False, 5, 'allowed', 'key')
        self.assertFalse(state.inserted)
        self.assertEqual(state.commits, 0)
        self.assertFalse(state.transaction)

    def test_video_download_hook_creates_local_poster_before_legacy_upload(self):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]}, {'1': {'is_video': True}})
        def download(bot, url, path):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'neutral-video')
            return True
        def poster(video, path):
            path.write_bytes(b'neutral-poster')
        def process(bot, post):
            path = source.Config.DOWNLOAD_DIR / '1.mp4'
            self.assertTrue(bot.download('https://fixture.invalid/video.mp4', path))
            self.assertEqual((path.parent / '1_thumb.webp').read_bytes(), b'neutral-poster')
            self.assertEqual(bot.fetch_details('1')['thumbnail_path'], '')
        with patch.object(source.MegaBot, 'download', download, create=True), \
             patch.object(source.MegaBot, 'process_post', process), \
             patch.object(adapter.integrity, 'validate_file', return_value='video/mp4') as check, \
             patch.object(adapter.integrity, 'make_poster', side_effect=poster) as make:
            self.run_fixture(source, state)
        check.assert_called_once()
        self.assertEqual(check.call_args.kwargs, {'video': True})
        make.assert_called_once()

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
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}, {'id': '2', 'handle': 'another'}]},
                                       {'2': {'handle': 'another'}})
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

    def test_busy_stripe_keeps_page_pending_and_processes_other_posts(self):
        source, state = source_fixture({
            1: [{'id': '1', 'handle': 'allowed'}],
            2: [{'id': '2', 'handle': 'allowed'}, {'id': '3', 'handle': 'allowed'}],
        })
        real_lock = adapter.media_lock

        @contextmanager
        def contended_lock(directory, source_id):
            if source_id == '2':
                raise adapter.MediaLockBusy('media_lock_busy')
            with real_lock(directory, source_id):
                yield

        with patch.object(adapter, 'media_lock', new=contended_lock):
            with self.assertRaisesRegex(adapter.MediaLockBusy, 'media_lock_busy'):
                self.run_fixture(source, state, max_pages=2)
        self.assertEqual(state.checkpoints, [(2, 0)])
        self.assertEqual(state.inserted, {'1', '3'})
        self.assertFalse(any(url.endswith('/media/2') for url in state.requests))

        result = self.run_fixture(source, state, next_page=2, max_pages=1)
        self.assertEqual(result['new'], 1)
        self.assertEqual(state.inserted, {'1', '2', '3'})
        self.assertEqual(state.checkpoints, [(2, 0), (3, 0)])
        self.assertEqual(sum(url.endswith('/media/3') for url in state.requests), 1)

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

    def test_new_worker_retries_busy_legacy_stripe_then_acquires_it(self):
        context = multiprocessing.get_context('spawn')
        acquired, release = context.Event(), context.Event()
        holder = context.Process(target=_legacy_lock_process, args=(self.directory.name, acquired, release))
        holder.start()
        try:
            self.assertTrue(acquired.wait(5))
            with self.assertRaisesRegex(adapter.MediaLockBusy, 'media_lock_busy'):
                with adapter.media_lock(self.directory.name, 'same-id'):
                    self.fail('entered the held legacy stripe')
            # These different IDs both use legacy stripe 11.
            with self.assertRaisesRegex(adapter.MediaLockBusy, 'media_lock_busy'):
                with adapter.media_lock(self.directory.name, 'fixture-34'):
                    self.fail('entered the held legacy stripe with another ID')
            self.assertTrue(holder.is_alive())
            with adapter.media_lock(self.directory.name, 'different-id'):
                pass
            release.set()
            holder.join(5)
            self.assertEqual(holder.exitcode, 0)
            with adapter.media_lock(self.directory.name, 'same-id'):
                pass
        finally:
            if holder.is_alive():
                holder.terminate()
                holder.join(5)

    def test_current_workers_exclude_same_id_but_share_legacy_stripe(self):
        context = multiprocessing.get_context('spawn')
        acquired, release = context.Event(), context.Event()
        holder = context.Process(target=_current_lock_process, args=(self.directory.name, acquired, release))
        holder.start()
        try:
            self.assertTrue(acquired.wait(5))
            with self.assertRaisesRegex(adapter.MediaLockBusy, 'media_lock_busy'):
                with adapter.media_lock(self.directory.name, 'same-id'):
                    self.fail('entered a held media lock')
            with adapter.media_lock(self.directory.name, 'fixture-34'):
                self.assertTrue(holder.is_alive())
            # An old process and a rollback still open the original path exclusively.
            with (Path(self.directory.name) / 'media-11.lock').open('a+b') as legacy_lock:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(legacy_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                release.set()
                holder.join(5)
                self.assertEqual(holder.exitcode, 0)
                fcntl.flock(legacy_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        finally:
            if holder.is_alive():
                holder.terminate()
                holder.join(5)


if __name__ == '__main__':
    unittest.main()
