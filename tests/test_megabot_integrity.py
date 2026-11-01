from pathlib import Path
import tempfile
import shutil
import subprocess
import unittest
from unittest.mock import patch

from ops.megabot_queue import integrity, notices


def has_webp_encoder():
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        return False
    return 'libwebp' in subprocess.run(['ffmpeg', '-hide_banner', '-encoders'],
                                     capture_output=True, text=True, timeout=10).stdout


class StorageFixture:
    def __init__(self):
        self.objects = {}
        self.puts = 0
        self.after_put = None

    def head_object(self, *, Bucket, Key):
        if Key not in self.objects:
            error = RuntimeError('missing')
            error.response = {'ResponseMetadata': {'HTTPStatusCode': 404}}
            raise error
        return self.objects[Key]

    def put_object(self, **kwargs):
        assert kwargs['IfNoneMatch'] == '*'
        self.puts += 1
        self.objects[kwargs['Key']] = self.after_put or {
            'ContentLength': kwargs['ContentLength'], 'ContentType': kwargs['ContentType'],
        }


class IntegrityTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'image.jpg'
        self.path.write_bytes(b'\xff\xd8\xffneutral-jpeg')
        self.client = StorageFixture()
        self.store = integrity.VerifiedStorage(self.client, 'bucket', 'https://fixture.invalid/media')

    def upload(self):
        with patch.object(integrity, 'validate_file', return_value='image/jpeg'):
            return self.store.upload(str(self.path), 'creators/allowed/12.jpg')

    def test_false_strings_are_not_classified_as_video(self):
        for value in [False, 0, 'false', 'False', '0']:
            self.assertIs(integrity.video_flag(value, 'a.mp4'), False)
        for value in [True, 1, 'true', '1']:
            self.assertIs(integrity.video_flag(value, 'a.jpg'), True)
        self.assertIs(integrity.video_flag(None, 'a.jpg'), False)
        self.assertIs(integrity.video_flag(None, 'a.mp4'), True)
        with self.assertRaises(integrity.InvalidMedia):
            integrity.video_flag('unknown', 'a.mp4')

    def test_uploaded_object_is_head_verified_before_publication(self):
        url = self.upload()
        self.store.verify_publication('12', url, None, 'photo', self.path.stat().st_size,
                                      'allowed', 'creators/allowed/12.jpg')
        self.assertEqual(self.client.puts, 1)
        self.client.objects['creators/allowed/12.jpg']['ContentLength'] = 0
        with self.assertRaises(integrity.InvalidMedia):
            self.store.verify_publication('12', url, None, 'photo', self.path.stat().st_size,
                                          'allowed', 'creators/allowed/12.jpg')

    def test_missing_or_truncated_head_does_not_become_verified(self):
        self.client.after_put = {'ContentLength': 1, 'ContentType': 'image/jpeg'}
        with self.assertRaises(integrity.InvalidMedia):
            self.upload()
        self.assertFalse(self.store.uploaded)

    def test_existing_matching_object_is_not_overwritten(self):
        self.client.objects['creators/allowed/12.jpg'] = {
            'ContentLength': self.path.stat().st_size, 'ContentType': 'image/jpeg',
        }
        self.upload()
        self.assertEqual(self.client.puts, 0)
        self.client.objects['creators/allowed/12.jpg']['ContentType'] = 'video/mp4'
        with self.assertRaises(integrity.InvalidMedia):
            self.upload()
        self.assertEqual(self.client.puts, 0)

    def test_unverified_url_wrong_owner_and_video_poster_are_rejected(self):
        url = self.upload()
        for values in [
            ('12', 'https://other.invalid/image.jpg', None, 'photo', 'allowed', 'creators/allowed/12.jpg'),
            ('12', url, None, 'photo', 'other', 'creators/allowed/12.jpg'),
            ('12', url, url, 'video', 'allowed', 'creators/allowed/12.jpg'),
        ]:
            sid, image, video, kind, handle, key = values
            with self.assertRaises(integrity.InvalidMedia):
                self.store.verify_publication(sid, image, video, kind, self.path.stat().st_size, handle, key)

    def test_image_validation_rejects_mp4_or_html(self):
        for body in [b'\x00\x00\x00\x18ftypmp42neutral', b'<html>not media</html>']:
            self.path.write_bytes(body)
            with patch.object(integrity, 'probe', return_value={'streams': [{'width': 8, 'height': 8}], 'format': {'duration': '1'}}):
                with self.assertRaises(integrity.InvalidMedia):
                    integrity.validate_file(self.path, video=False)

    @unittest.skipUnless(has_webp_encoder(), 'ffmpeg has no libwebp encoder')
    def test_real_neutral_video_produces_a_decodable_webp_poster(self):
        video = Path(self.directory.name) / 'neutral.mp4'
        poster = Path(self.directory.name) / 'neutral.webp'
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
                        'color=c=blue:s=32x32:r=1:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        str(video)], check=True, capture_output=True, timeout=15)
        self.assertEqual(integrity.validate_file(video, video=True), 'video/mp4')
        integrity.make_poster(video, poster)
        self.assertEqual(integrity.validate_file(poster, video=False), 'image/webp')


class NoticesTest(unittest.TestCase):
    def test_creator_and_media_notices_keep_locale_and_version_matching(self):
        row = {'id': 'uuid-neutral', 'creator_id': 'creator-neutral', 'handle': 'allowed', 'source_id': '12'}
        self.assertTrue(notices.notice_matches(row, {'urls': '["https://leakfanhub.com/fr/allowed-v3"]'}))
        self.assertTrue(notices.notice_matches(row, {'targets': [{'kind': 'creator', 'id': 'creator-neutral'}]}))
        self.assertTrue(notices.notice_matches(row, {'urls': '["https://leakfanhub.com/en/allowed/12-v2"]'}))
        self.assertFalse(notices.notice_matches(row, {'urls': '["https://other.invalid/allowed/12"]'}))

    def test_new_media_without_uuid_does_not_match_every_notice(self):
        row = {'id': '', 'handle': 'allowed', 'source_id': '12'}
        self.assertFalse(notices.notice_matches(row, {'urls': '["https://leakfanhub.com/other/12"]'}))
        self.assertFalse(notices.notice_matches(row, {'urls': ['https://leakfanhub.com/']}))


if __name__ == '__main__':
    unittest.main()
