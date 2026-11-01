"""Exact local copies, using neutral byte fixtures and no network/media I/O."""
import copy
import hashlib
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


cache = load('local_cache_test', ROOT/'ops/local-media-cache.py')
video_fixtures = load('cache_video_fixtures', ROOT/'tests/test_missing_video_repair.py')
photo_fixtures = load('cache_photo_fixtures', ROOT/'tests/test_misclassified_photo_repair.py')


class CacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.cache = self.root/'cache'; self.cache.mkdir()
        self.source = self.cache/'12.mp4'; self.data = b'\0\0\0\x18ftypisom-neutral-complete-fixture'
        self.source.write_bytes(self.data); self.target = self.root/'private-copy'
        self.env = patch.dict(os.environ, {'MEDIA_REPAIR_LOCAL_CACHE': str(self.cache)})
        self.env.start(); self.addCleanup(self.env.stop)

    def attempt(self, **kw):
        return cache.copy_media(kw.pop('source_id', 12), kw.pop('extension', '.mp4'),
                                self.target, expected_size=kw.pop('expected_size', len(self.data)),
                                limit=kw.pop('limit', 1024), **kw)

    def test_exact_copy_is_private_hashed_and_preserves_original(self):
        before = self.source.stat(); result = self.attempt()
        self.assertEqual(result, {'bytes':len(self.data), 'sha256':hashlib.sha256(self.data).hexdigest()})
        self.assertEqual(self.target.read_bytes(), self.data); self.assertEqual(self.source.read_bytes(), self.data)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)
        self.assertEqual((before.st_ino,before.st_mtime_ns), (self.source.stat().st_ino,self.source.stat().st_mtime_ns))

    def test_cache_is_disabled_without_opt_in(self):
        with patch.dict(os.environ, {'MEDIA_REPAIR_LOCAL_CACHE':''}): self.assertIsNone(self.attempt())
        self.assertFalse(self.target.exists())

    def test_size_must_be_known_positive_exact_and_bounded(self):
        for size in (0, None, -1, True, str(len(self.data)), len(self.data)-1, len(self.data)+1):
            self.assertIsNone(self.attempt(expected_size=size)); self.assertFalse(self.target.exists())
        self.assertIsNone(self.attempt(limit=len(self.data)-1)); self.assertFalse(self.target.exists())

    def test_identity_and_suffix_cannot_select_another_file(self):
        for values in ({'source_id':'../12'}, {'source_id':True}, {'extension':'.mp4/../12.mp4'},
                       {'source_id':99}, {'extension':'.webm'}):
            self.assertIsNone(self.attempt(**values)); self.assertFalse(self.target.exists())

    def test_symlink_nonregular_and_symlink_directory_are_rejected(self):
        self.source.unlink(); self.source.symlink_to(self.root/'outside'); (self.root/'outside').write_bytes(self.data)
        self.assertIsNone(self.attempt()); self.source.unlink(); self.source.mkdir()
        self.assertIsNone(self.attempt()); self.source.rmdir(); os.mkfifo(self.source)
        self.assertIsNone(self.attempt()); self.source.unlink(); self.source.write_bytes(self.data)
        linked = self.root/'linked-cache'; linked.symlink_to(self.cache, target_is_directory=True)
        with patch.dict(os.environ, {'MEDIA_REPAIR_LOCAL_CACHE':str(linked)}): self.assertIsNone(self.attempt())
        self.assertFalse(self.target.exists())

    def test_html_and_wrong_container_signature_are_rejected(self):
        for data in (b'<html>not a media file</html>', b'\xff\xd8\xffphoto-in-video-file'):
            self.source.write_bytes(data)
            self.assertIsNone(self.attempt(expected_size=len(data))); self.assertFalse(self.target.exists())

    def test_changed_cache_during_copy_is_rejected_and_only_copy_is_removed(self):
        original_read = cache.os.read; changed = []
        def changing_read(fd, size):
            data = original_read(fd,size)
            if data and not changed:
                changed.append(True); replacement = self.cache/'replacement'; replacement.write_bytes(self.data)
                os.replace(replacement,self.source)
            return data
        with patch.object(cache.os,'read',side_effect=changing_read): self.assertIsNone(self.attempt())
        self.assertFalse(self.target.exists()); self.assertEqual(self.source.read_bytes(),self.data)

    def test_same_inode_changed_mtime_during_copy_is_rejected(self):
        original_read = cache.os.read; changed = []; before = self.source.stat()
        def changing_read(fd, size):
            data = original_read(fd,size)
            if data and not changed:
                changed.append(True)
                os.utime(self.source,ns=(before.st_atime_ns,before.st_mtime_ns+1_000_000_000))
            return data
        with patch.object(cache.os,'read',side_effect=changing_read): self.assertIsNone(self.attempt())
        self.assertFalse(self.target.exists()); self.assertEqual(self.source.stat().st_ino,before.st_ino)
        self.assertEqual(self.source.read_bytes(),self.data)

    def test_existing_destination_is_never_overwritten_or_removed(self):
        self.target.write_bytes(b'preserve'); self.assertIsNone(self.attempt())
        self.assertEqual(self.target.read_bytes(),b'preserve')


class CacheIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.video = video_fixtures.RepairTests(); self.video.setUp(); self.addCleanup(self.video.doCleanups)
        self.photo = photo_fixtures.PhotoRepairTests(); self.photo.setUp(); self.addCleanup(self.photo.doCleanups)
        self.cache = self.video.root/'local-cache'; self.cache.mkdir()
        self.env = patch.dict(os.environ, {'MEDIA_REPAIR_LOCAL_CACHE':str(self.cache)})
        self.env.start(); self.addCleanup(self.env.stop)
        self.video_data = b'\0\0\0\x18ftypisom-neutral-video-fixture'
        self.probe = {'duration':2,'codec':'h264','format':'mov,mp4'}

    def poster(self, source, destination, extension): Path(destination).write_bytes(b'RIFF0000WEBP-neutral')

    def video_cached(self):
        (self.cache/'12.mp4').write_bytes(self.video_data); self.video.row['file_size']=len(self.video_data)

    def test_video_uses_exact_local_copy_after_source_validation(self):
        self.video_cached(); checked=[]; old=self.video.runtime.details
        self.video.runtime.details=lambda row:checked.append(True) or old(row)
        with patch.object(video_fixtures.repair,'probe_video',return_value=self.probe), patch.object(video_fixtures.repair,'make_poster',side_effect=self.poster):
            result=self.video.runtime.run(copy.deepcopy(self.video.row),True)
        self.assertTrue(checked); self.assertEqual(result['status'],'restored')
        self.assertEqual(self.video.runtime.downloads,['https://cdn.leakgallery.com/thumb.jpg'])
        self.assertEqual(self.video.runtime.s3.objects['creators/person/12.mp4'],self.video_data)
        self.assertEqual((self.cache/'12.mp4').read_bytes(),self.video_data)

    def test_bad_video_probe_discards_only_copy_then_downloads_normally(self):
        self.video_cached()
        with patch.object(video_fixtures.repair,'probe_video',side_effect=[video_fixtures.repair.RepairError('invalid_video'),self.probe]), patch.object(video_fixtures.repair,'make_poster',side_effect=self.poster):
            self.video.runtime.run(copy.deepcopy(self.video.row),True)
        self.assertEqual(len(self.video.runtime.downloads),2)
        self.assertEqual((self.cache/'12.mp4').read_bytes(),self.video_data)

    def test_refused_source_does_not_consult_or_publish_local_cache(self):
        self.video_cached(); self.video.runtime.details=lambda row:(_ for _ in ()).throw(video_fixtures.repair.RepairError('source_unavailable'))
        with patch.object(video_fixtures.repair.local_cache,'copy_media') as attempt:
            with self.assertRaises(video_fixtures.repair.RepairError):self.video.runtime.run(copy.deepcopy(self.video.row),True)
            attempt.assert_not_called()
        self.assertFalse(self.video.runtime.s3.puts)

    def test_withdrawal_after_cached_copy_still_blocks_upload(self):
        self.video_cached(); calls=[]
        def candidate(expected):
            calls.append(True)
            if len(calls)>1:raise video_fixtures.repair.RepairError('notice_excluded')
            return copy.deepcopy(self.video.row)
        self.video.runtime.candidate=candidate
        with patch.object(video_fixtures.repair,'probe_video',return_value=self.probe), patch.object(video_fixtures.repair,'make_poster',side_effect=self.poster):
            with self.assertRaises(video_fixtures.repair.RepairError):self.video.runtime.run(copy.deepcopy(self.video.row),True)
        self.assertFalse(self.video.runtime.s3.puts); self.assertFalse(self.video.runtime.updates)

    def photo_cached(self):
        data=b'\xff\xd8\xff-neutral-original-photo'; (self.cache/'12.jpg').write_bytes(data)
        self.photo.row['file_size']=len(data); return data

    def test_photo_copy_still_passes_full_image_conversion(self):
        data=self.photo_cached()
        with patch.object(photo_fixtures.r,'reencode_image',side_effect=self.photo.encoding) as encode:
            result=self.photo.runtime.run(copy.deepcopy(self.photo.row),True)
        self.assertEqual(result['status'],'photo_restored'); self.assertEqual(self.photo.requests,[])
        encode.assert_called_once(); self.assertEqual((self.cache/'12.jpg').read_bytes(),data)

    def test_invalid_cached_image_conversion_falls_back_to_http(self):
        self.photo_cached(); calls=[]
        def encode(source,destination,extension):
            calls.append(True)
            if len(calls)==1:
                Path(destination).write_bytes(b'partial'); raise photo_fixtures.r.RepairError('full_image_conversion_failed')
            return self.photo.encoding(source,destination,extension)
        with patch.object(photo_fixtures.r,'reencode_image',side_effect=encode):self.photo.runtime.run(copy.deepcopy(self.photo.row),True)
        self.assertEqual(len(calls),2); self.assertEqual(len(self.photo.requests),1)

    def test_photo_source_refusal_does_not_consult_cache(self):
        self.photo_cached(); self.photo.details['owner']='other'
        with patch.object(photo_fixtures.r.base.local_cache,'copy_media') as attempt:
            with self.assertRaises(photo_fixtures.r.RepairError):self.photo.runtime.run(copy.deepcopy(self.photo.row),True)
            attempt.assert_not_called()
        self.assertFalse(self.photo.runtime.s3.puts)


if __name__=='__main__':unittest.main()
