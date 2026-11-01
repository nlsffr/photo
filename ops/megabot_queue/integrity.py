"""Validate newly downloaded files and prove storage before SQL publication."""
import json
from pathlib import Path
import subprocess
from urllib.parse import urlsplit


class InvalidMedia(RuntimeError):
    pass


def video_flag(value, url):
    if value is True or (type(value) is int and value == 1) or (isinstance(value, str) and value.casefold() in ('true', '1')):
        return True
    if value is False or (type(value) is int and value == 0) or (isinstance(value, str) and value.casefold() in ('false', '0')):
        return False
    if value is None:
        suffix = Path(urlsplit(url).path).suffix.lower()
        if suffix in ('.mp4', '.mov', '.webm', '.m4v'):
            return True
        if suffix in ('.jpg', '.jpeg', '.png', '.webp'):
            return False
    raise InvalidMedia('invalid_video_flag')


def probe(path):
    try:
        run = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                              'format=duration:stream=codec_type,codec_name,width,height',
                              '-of', 'json', str(path)], capture_output=True, timeout=45, check=True)
        return json.loads(run.stdout)
    except Exception:
        raise InvalidMedia('invalid_downloaded_media') from None


def validate_file(path, video=None):
    path = Path(path)
    if not path.is_file() or not 0 < path.stat().st_size <= 2 * 1024**3:
        raise InvalidMedia('invalid_downloaded_size')
    with path.open('rb') as stream:
        first = stream.read(32)
    mime = ('image/jpeg' if first.startswith(b'\xff\xd8\xff') else
            'image/png' if first.startswith(b'\x89PNG\r\n\x1a\n') else
            'image/webp' if first.startswith(b'RIFF') and first[8:12] == b'WEBP' else
            'video/mp4' if first[4:8] in (b'ftyp', b'wide', b'free', b'mdat') else
            'video/webm' if first.startswith(b'\x1aE\xdf\xa3') else None)
    if mime is None or (video is not None and mime.startswith('video/') != video):
        raise InvalidMedia('downloaded_type_mismatch')
    details = probe(path)
    visual = next((s for s in details.get('streams', []) if s.get('codec_type') == 'video'), {})
    if not visual.get('codec_name') or visual.get('width', 0) <= 0 or visual.get('height', 0) <= 0:
        raise InvalidMedia('invalid_downloaded_media')
    if mime.startswith('video/') and float(details.get('format', {}).get('duration') or 0) <= 0:
        raise InvalidMedia('invalid_video_duration')
    return mime


def make_poster(video, destination):
    destination = Path(destination)
    temporary = destination.with_name(destination.stem + '.part.webp')
    try:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(video),
                        '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=min(640\\,iw):-2',
                        '-c:v', 'libwebp', str(temporary)], capture_output=True, timeout=60, check=True)
        validate_file(temporary, video=False)
        temporary.replace(destination)
    except Exception:
        raise InvalidMedia('poster_generation_failed') from None
    finally:
        temporary.unlink(missing_ok=True)


class VerifiedStorage:
    def __init__(self, client, bucket, public_base, before_write=lambda: None):
        self.client, self.bucket, self.public_base = client, bucket, public_base.rstrip('/')
        self.before_write = before_write
        self.uploaded = {}

    def head(self, key):
        try:
            return self.client.head_object(Bucket=self.bucket, Key=key)
        except Exception as error:
            status = getattr(error, 'response', {}).get('ResponseMetadata', {}).get('HTTPStatusCode')
            if status == 404:
                return None
            raise InvalidMedia('storage_head_failed') from None

    def verify(self, key, size, mime):
        result = self.head(key)
        if not result or result.get('ContentLength') != size or result.get('ContentType', '').split(';')[0] != mime:
            raise InvalidMedia('storage_object_not_verified')

    def upload(self, local_path, key):
        mime = validate_file(local_path)
        size = Path(local_path).stat().st_size
        self.before_write()
        current = self.head(key)
        if current is None:
            try:
                with Path(local_path).open('rb') as body:
                    self.client.put_object(Bucket=self.bucket, Key=key, Body=body, ContentLength=size,
                                           ContentType=mime, CacheControl='public, max-age=300', IfNoneMatch='*')
            except Exception as error:
                status = getattr(error, 'response', {}).get('ResponseMetadata', {}).get('HTTPStatusCode')
                if status not in (409, 412):
                    raise InvalidMedia('conditional_upload_failed') from None
        self.verify(key, size, mime)
        public = self.public_base + '/' + key
        self.uploaded[public] = {'key': key, 'size': size, 'mime': mime}
        return public

    def verify_publication(self, source_id, image_url, video_url, media_type, file_size, handle, key):
        image = self.uploaded.get(image_url)
        main = self.uploaded.get(video_url) if media_type == 'video' else image
        if (media_type not in ('photo', 'video') or not image or not main
                or not image['mime'].startswith('image/')
                or (media_type == 'video' and (image_url == video_url or not main['mime'].startswith('video/')))
                or (media_type == 'photo' and video_url is not None)
                or main['size'] != file_size or main['key'] != key
                or not key.startswith(f'creators/{handle}/{source_id}.')):
            raise InvalidMedia('publication_assets_not_verified')
        if media_type == 'video' and image['key'] != f'creators/{handle}/{source_id}_thumb.webp':
            raise InvalidMedia('publication_poster_not_verified')
        for asset in (image, main):
            self.verify(asset['key'], asset['size'], asset['mime'])
