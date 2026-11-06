"""Guard exact-identity recovery and conditional publication using synthetic objects."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from test_missing_video_repair import Store

MODULE = Path(__file__).resolve().parents[1] / 'ops/repair-missing-video-url.py'
spec = importlib.util.spec_from_file_location('video_url_repair', MODULE)
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)
SOURCE = ('/file.mp4', 'https://cdn.leakgallery.com/file.mp4', '.mp4')
VIDEO = b'\0\0\0\x18ftypisomsynthetic-clip'
IMAGE = b'RIFF0000WEBPsynthetic-poster'
VIDEO_KEY = 'creators/person/12.mp4'
ORIGINAL_KEY = 'creators/person/12.webp'


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.row = {'id':'4bb0fcb1-5351-4b49-bf2d-6e808903ff83', 'source_id':12, 'photo_source_id':'12',
                    'creator_id':'creator', 'handle':'person', 'registry_handle':'person', 'minio_key':ORIGINAL_KEY,
                    'video_url':None, 'image_url':'/media/' + ORIGINAL_KEY, 'preview_url':None,
                    'url_version':1, 'type':'video', 'file_size':6}
        self.runtime = repair.Repair.__new__(repair.Repair)
        self.runtime.s3 = Store()
        self.runtime.s3.objects[ORIGINAL_KEY] = b'original-object'
        self.runtime.bucket = 'fixture'
        self.runtime.journal = self.root / 'journal.jsonl'
        self.runtime.candidate = Mock(side_effect=lambda expected: copy.deepcopy(self.row))
        self.runtime.video_source = Mock(return_value=SOURCE)
        self.runtime.download = Mock(side_effect=self.download)
        self.runtime.update_links = Mock()
        self.probe = self.enterContext(patch.object(repair.base, 'probe_video', return_value={'format':'mov,mp4'}))
        self.poster = self.enterContext(patch.object(repair.base, 'make_poster', side_effect=self.make_poster))

    @staticmethod
    def download(url, path):
        path.write_bytes(VIDEO)
        return {'bytes':len(VIDEO), 'sha256':hashlib.sha256(VIDEO).hexdigest()}

    @staticmethod
    def make_poster(video, path, extension):
        if video.read_bytes() != VIDEO:
            raise AssertionError('unexpected main bytes')
        path.write_bytes(IMAGE)

    def test_video_with_image_registry_gets_new_verified_assets_and_preserves_original(self):
        result = self.runtime.run(copy.deepcopy(self.row), apply=True)
        self.assertEqual(result['status'], 'restored')
        self.assertEqual(self.runtime.video_source.call_count, 2)
        self.assertEqual(self.runtime.s3.objects[ORIGINAL_KEY], b'original-object')
        self.assertEqual(self.runtime.s3.objects[VIDEO_KEY], VIDEO)
        _, video_key, poster_key, size = self.runtime.update_links.call_args.args
        self.assertEqual((video_key, size), (VIDEO_KEY, len(VIDEO)))
        self.assertEqual(self.runtime.s3.objects[poster_key], IMAGE)
        self.assertEqual([p['Key'] for p in self.runtime.s3.puts], [VIDEO_KEY, poster_key])
        self.assertTrue(all(p['IfNoneMatch'] == '*' for p in self.runtime.s3.puts))

    def test_video_registry_and_stored_main_are_reused(self):
        self.row['minio_key'] = VIDEO_KEY
        self.runtime.s3.objects[VIDEO_KEY] = VIDEO
        self.runtime.run(copy.deepcopy(self.row), apply=True)
        self.runtime.download.assert_not_called()
        self.assertEqual([get[1] for get in self.runtime.s3.gets], [VIDEO_KEY])
        self.assertEqual(len(self.runtime.s3.puts), 1)
        self.assertEqual(self.runtime.s3.objects[VIDEO_KEY], VIDEO)

    def test_conflicting_existing_video_is_preserved_and_unlinked(self):
        conflicting = b'x' * len(VIDEO)
        self.runtime.s3.objects[VIDEO_KEY] = conflicting
        with self.assertRaisesRegex(repair.RepairError, 'stored_object_changed'):
            self.runtime.run(copy.deepcopy(self.row), apply=True)
        self.assertEqual(self.runtime.s3.objects[VIDEO_KEY], conflicting)
        self.assertEqual([p['Key'] for p in self.runtime.s3.puts], [VIDEO_KEY])
        self.runtime.update_links.assert_not_called()

    def test_dry_run_source_revalidation_and_withdrawal_do_not_write(self):
        self.assertEqual(self.runtime.run(copy.deepcopy(self.row))['status'], 'would_restore')
        self.runtime.download.assert_not_called()
        self.runtime.video_source.side_effect = [SOURCE, repair.RepairError('source_excluded')]
        with self.assertRaisesRegex(repair.RepairError, 'source_excluded'):
            self.runtime.run(copy.deepcopy(self.row), apply=True)
        self.assertEqual(self.runtime.s3.puts, [])
        self.runtime.update_links.assert_not_called()

    def test_missing_video_record_rejects_mismatched_storage_path_or_owner(self):
        for changed in ({'registry_handle':'other'}, {'minio_key':'creators/other/12.mp4'},
                        {'minio_key':'creators/person//12.mp4'}, {'video_url':'/media/' + VIDEO_KEY}):
            with self.subTest(changed=changed), self.assertRaises(repair.RepairError):
                repair.validate_candidate(self.row, {**self.row, **changed})

    def test_registry_update_failure_rolls_back_row_and_registry_in_same_transaction(self):
        db = Mock()
        cursor = db.cursor.return_value
        self.runtime.db = db
        self.runtime._candidate = Mock(return_value=self.row)

        def execute(statement, parameters):
            cursor.rowcount = 0 if 'UPDATE bot_ingested' in statement else 1

        cursor.execute.side_effect = execute
        with self.assertRaisesRegex(repair.RepairError, 'registry_changed'):
            repair.Repair.update_links(self.runtime, self.row, VIDEO_KEY, 'poster.webp', len(VIDEO))
        self.runtime._candidate.assert_called_once_with(cursor, self.row, lock=True)
        self.assertEqual(cursor.execute.call_count, 2)
        db.rollback.assert_called_once()
        db.commit.assert_not_called()


if __name__ == '__main__':
    unittest.main()
