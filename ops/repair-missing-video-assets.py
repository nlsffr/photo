#!/usr/bin/env python3
"""Restore only missing objects for an explicitly bounded, private video plan.

Preserves page URLs, source IDs and versions; never overwrites an object.
Legacy video-as-thumbnail references are changed only after a real image exists.
The existing source and credentials are loaded from the pinned queue config.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import html
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.parse import unquote, urljoin, urlsplit

MAX_BYTES = 2 * 1024**3
MAX_IMAGE_BYTES = 25 * 1024**2

_cache_spec = importlib.util.spec_from_file_location('repair_local_media_cache', Path(__file__).with_name('local-media-cache.py'))
local_cache = importlib.util.module_from_spec(_cache_spec)
_cache_spec.loader.exec_module(local_cache)


class RepairError(RuntimeError):
    pass


def object_key(url):
    parsed = urlsplit(url or '')
    if parsed.scheme and parsed.scheme != 'https':
        raise RepairError('invalid_asset_url')
    if parsed.netloc and parsed.hostname != 'leakfanhub.com':
        raise RepairError('invalid_asset_host')
    path = unquote(parsed.path)
    if (not path.startswith('/media/creators/') or '..' in path.split('/')
            or any(ord(c) < 32 for c in path) or parsed.query or parsed.fragment):
        raise RepairError('invalid_asset_path')
    return path[len('/media/'):]


def legacy_poster_url(expected):
    """Repair a missing or video-valued image reference, including exact replay."""
    if (not expected.get('video_url')
            or expected.get('image_url') not in (None, '', expected['video_url'])
            or expected.get('preview_url') not in (None, '')):
        return None
    object_key(expected['video_url'])
    parsed = urlsplit(expected['video_url'])
    return parsed._replace(path=parsed.path.rsplit('.', 1)[0] + '_thumb.webp').geturl()


def validate_candidate(expected, actual):
    if not actual or actual['is_hidden'] or actual['creator_hidden'] or actual['removed_from_index_at'] or actual['creator_removed']:
        raise RepairError('excluded')
    for field in ('id', 'video_url', 'preview_url', 'url_version', 'photo_source_id', 'creator_id', 'handle'):
        if actual.get(field) != expected.get(field):
            raise RepairError('candidate_changed')
    derived_poster = legacy_poster_url(expected)
    if actual.get('image_url') != expected.get('image_url') and (
            derived_poster is None or actual.get('image_url') != derived_poster):
        raise RepairError('candidate_changed')
    expected_source = expected.get('source_id')
    if not expected_source or str(actual.get('source_id')) != str(expected_source):
        raise RepairError('registry_changed')
    video = object_key(actual['video_url'])
    if video != actual.get('minio_key'):
        raise RepairError('registry_key_changed')
    if not re.search(r'\.(mp4|mov|webm|m4v)$', video, re.I):
        raise RepairError('invalid_video_key')
    poster = object_key(derived_poster or actual['image_url'])
    if not re.search(r'\.(webp|png|jpe?g)$', poster, re.I):
        raise RepairError('invalid_poster_key')
    if video == poster:
        raise RepairError('poster_is_video')
    return video, poster


def creator_notice_matches(row, notice):
    values = []
    def visit(value):
        if isinstance(value, dict):
            if value.get('kind') == 'creator' and (
                    str(value.get('handle') or value.get('creator_handle') or '').casefold() == row['handle'].casefold()
                    or (row.get('creator_id') and str(value.get('id') or value.get('creator_id')) == str(row['creator_id']))):
                return True
            return any(visit(v) for v in value.values())
        if isinstance(value, list):
            return any(visit(v) for v in value)
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except (ValueError, TypeError):
                values.append(value.replace('\\/', '/'))
                return False
            return visit(parsed)
        return False
    if any(visit(notice.get(field)) for field in ('urls', 'targets')):
        return True
    for value in values:
        for url in re.findall(r'https?://[^\s"<>\\\]\[}]+', html.unescape(value)):
            parsed = urlsplit(url)
            if parsed.hostname not in ('leakfanhub.com', 'www.leakfanhub.com'):
                continue
            parts = unquote(parsed.path).strip('/').split('/')
            if len(parts) == 2 and parts[0] in ('fr','en','es','de','it','pt','nl'):
                parts = parts[1:]
            if len(parts) == 1 and re.fullmatch(re.escape(row['handle']) + r'(?:-v[1-9][0-9]*)?', parts[0], re.I):
                return True
    return False


def notice_matches(row, notice):
    if creator_notice_matches(row, notice):
        return True
    text = html.unescape(unquote(str(notice.get('urls') or '') + ' ' + str(notice.get('targets') or ''))).replace('\\/', '/')
    sid = re.escape(str(row['source_id']))
    return row['id'] in text or bool(re.search(r'/' + re.escape(row['handle']) + '/' + sid + r'(?:-v\d+)?(?:\.[a-zA-Z0-9]+)?(?:["\s/?#]|$)', text))


def head(s3, bucket, key):
    try:
        return s3.head_object(Bucket=bucket, Key=key)
    except Exception as error:
        status = getattr(error, 'response', {}).get('ResponseMetadata', {}).get('HTTPStatusCode')
        if status == 404:
            return None
        raise RepairError('storage_head_failed') from None


def put_missing(s3, bucket, key, path, mime):
    """The conditional write is atomic, unlike a preceding HEAD alone."""
    try:
        with Path(path).open('rb') as body:
            s3.put_object(Bucket=bucket, Key=key, Body=body, ContentLength=Path(path).stat().st_size,
                          ContentType=mime, CacheControl='public, max-age=300', IfNoneMatch='*')
    except Exception as error:
        status = getattr(error, 'response', {}).get('ResponseMetadata', {}).get('HTTPStatusCode')
        if status in (409, 412):
            return False
        raise RepairError('conditional_upload_failed') from None
    return True


def source_url(value):
    p = urlsplit(value or '')
    if p.scheme != 'https' or not (p.hostname == 'leakgallery.com' or (p.hostname or '').endswith('.leakgallery.com')) or p.username or p.password:
        raise RepairError('invalid_source_host')
    return value


def response_download(response, destination, limit, image=False):
    if response.status_code != 200:
        raise RepairError('source_http_' + str(response.status_code))
    mime = response.headers.get('Content-Type', '').split(';', 1)[0].lower()
    allowed = mime.startswith('image/') if image else mime.startswith('video/')
    if not allowed and mime not in ('application/octet-stream', 'binary/octet-stream'):
        raise RepairError('download_mime_rejected')
    length = response.headers.get('Content-Length')
    if length and (not length.isdigit() or int(length) > limit):
        raise RepairError('download_too_large')
    digest, size, first = hashlib.sha256(), 0, b''
    with Path(destination).open('xb') as out:
        for block in response.iter_content(1024 * 1024):
            if not block:
                continue
            if not first:
                first = block[:32]
                if first.lstrip().lower().startswith((b'<!doctype', b'<html', b'<?xml', b'{')):
                    raise RepairError('download_not_media')
                magic = (first.startswith(b'\xff\xd8\xff') or first.startswith(b'\x89PNG\r\n\x1a\n')
                         or (first.startswith(b'RIFF') and first[8:12] == b'WEBP')) if image else (
                            first[4:8] in (b'ftyp', b'wide', b'free', b'mdat') or first.startswith(b'\x1aE\xdf\xa3'))
                if not magic:
                    raise RepairError('download_signature_rejected')
            size += len(block)
            if size > limit:
                raise RepairError('download_too_large')
            out.write(block); digest.update(block)
    if size <= 0 or (length and size != int(length)):
        raise RepairError('download_incomplete')
    return {'bytes': size, 'sha256': digest.hexdigest()}


def probe_video(path):
    try:
        r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height,duration',
                            '-of', 'json', str(path)], capture_output=True, text=True, timeout=45, check=True)
        data = json.loads(r.stdout)
        stream = next(x for x in data.get('streams', []) if x.get('codec_type') == 'video')
        duration = float(data.get('format', {}).get('duration') or stream.get('duration') or 0)
        if duration <= 0 or not stream.get('codec_name') or stream.get('width', 0) <= 0 or stream.get('height', 0) <= 0:
            raise ValueError()
        return {'duration': duration, 'codec': stream['codec_name'], 'format': data['format']['format_name']}
    except Exception:
        raise RepairError('invalid_video') from None


def make_poster(input_path, output_path, extension):
    codec = {'.webp': 'libwebp', '.png': 'png', '.jpg': 'mjpeg', '.jpeg': 'mjpeg'}[extension]
    try:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(input_path), '-map', '0:v:0', '-frames:v', '1',
                        '-vf', 'scale=min(640\\,iw):-2', '-c:v', codec, str(output_path)],
                       capture_output=True, timeout=60, check=True)
        if Path(output_path).stat().st_size <= 0:
            raise ValueError()
    except Exception:
        raise RepairError('poster_generation_failed') from None


def private_json(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w') as out:
        json.dump(value, out, default=str); out.write('\n'); out.flush(); os.fsync(out.fileno())


class Repair:
    def __init__(self, config_path, journal):
        sys.path.insert(0, '/opt/megabot-queue/current')
        from ops.megabot_queue import supervisor, adapter
        import boto3
        from botocore.config import Config
        import mysql.connector
        self._config_path = config_path
        self._supervisor = supervisor
        self.config = supervisor.read_config(config_path); supervisor.verified_source(self.config)
        self.env = self.config['env']
        with supervisor.source_environment(self.env):
            self.source = adapter.load_source(self.config['source_path'])
        self.bot = self.source.MegaBot.__new__(self.source.MegaBot)
        self.direct_cdn = os.environ.get('MEDIA_REPAIR_DIRECT_CDN') == '1'
        self.bot.session = self.source.requests.Session(); self.bot.session.trust_env = False
        self.bot.session.headers.update({'User-Agent':'Mozilla/5.0','Accept':'application/json, text/plain, */*','Referer':'https://leakgallery.com/'})
        self.s3 = boto3.client('s3', endpoint_url=self.env['S3_ENDPOINT'], aws_access_key_id=self.env['S3_ACCESS_KEY'],
                              aws_secret_access_key=self.env['S3_SECRET_KEY'], region_name=self.env.get('S3_REGION','auto'),
                              config=Config(connect_timeout=5, read_timeout=120, retries={'total_max_attempts':1}))
        if 'IfNoneMatch' not in self.s3.meta.service_model.operation_model('PutObject').input_shape.members:
            raise RepairError('conditional_upload_not_supported')
        self.db = mysql.connector.connect(host=self.env['MEGABOT_DB_HOST'], user=self.env['MEGABOT_DB_USER'],
            password=self.env['MEGABOT_DB_PASSWORD'], database=self.env['MEGABOT_DB_NAME'], connection_timeout=5)
        self.bucket = self.env['S3_BUCKET']; self.journal = Path(journal)

    def prepare_reuse(self):
        """Reuse clients only while their configuration and source are unchanged."""
        current = self._supervisor.read_config(self._config_path)
        if current != self.config:
            raise RepairError('runtime_configuration_changed')
        self._supervisor.verified_source(current)

    def log(self, event):
        self.journal.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(self.journal, os.O_WRONLY|os.O_APPEND|os.O_CREAT|getattr(os, 'O_NOFOLLOW', 0), 0o600)
        try:
            if os.fstat(fd).st_mode & 0o077:
                raise RepairError('journal_not_private')
            os.write(fd, (json.dumps({'at':time.time(), **event}, default=str)+'\n').encode()); os.fsync(fd)
        finally:
            os.close(fd)

    def candidate(self, expected):
        cur = self.db.cursor(dictionary=True)
        try:
            cur.execute('SET SESSION max_statement_time=8')
            self.db.start_transaction(readonly=True)
            cur.execute('''SELECT p.id,p.source_id photo_source_id,p.file_size,p.url_version,p.video_url,p.image_url,p.preview_url,
                           p.is_hidden,p.removed_from_index_at,c.id creator_id,c.handle,c.is_hidden creator_hidden,c.removed_from_index_at creator_removed,
                           b.source_id,b.minio_key FROM photos p JOIN creators c ON c.id=p.creator_id
                           JOIN bot_ingested b ON b.source_id=%s AND b.photo_id=p.id
                           WHERE p.id=%s AND p.type='video' ''', (expected['source_id'], expected['id']))
            row = cur.fetchone(); validate_candidate(expected, row)
            for table, fields in [('dmca_notices','urls'),('dmca_mail_events','urls,targets')]:
                cur.execute('SELECT '+fields+' FROM '+table)
                if any(notice_matches(row, n) for n in cur.fetchall()):
                    raise RepairError('notice_excluded')
            return row
        finally:
            self.db.rollback(); cur.close()

    def request(self, url, stream=False):
        url = source_url(url)
        for _ in range(4):
            # The public CDN can be reached directly; keep API validation on its
            # configured route. Never retry a CDN refusal through another route.
            direct = stream and getattr(self, 'direct_cdn', False) and urlsplit(url).hostname == 'cdn.leakgallery.com'
            r = self.bot.session.get(url, stream=stream, timeout=(10,60),
                                     proxies=None if direct else self.bot.get_proxy(), allow_redirects=False)
            if r.status_code in (301,302,303,307,308):
                location = r.headers.get('Location'); r.close()
                url = source_url(urljoin(url, location or '')); continue
            return r
        raise RepairError('source_redirect_limit')

    def details(self, row):
        with self.request(self.source.Config.BASE_URL+'/media/'+str(row['source_id'])) as r:
            if r.status_code != 200:
                if r.status_code in (401, 403, 404, 410):
                    raise RepairError('source_unavailable')
                raise RepairError('source_http_' + str(r.status_code))
            d = r.json()
        if (not isinstance(d, dict) or d.get('error') or d.get('errors')
                or d.get('is_video') is not True
                or str(d.get('id') or d.get('media_id') or '') != str(row['source_id'])
                or any(d.get(x) for x in ('removed','is_removed','is_hidden','removed_at'))
                or self.source.extract_handle(d).casefold() != row['handle'].casefold()):
            raise RepairError('source_excluded')
        return {'video':source_url(self.source.cdn_url(d.get('file_path') or d.get('url') or '')),
                'poster':self.source.cdn_url(d.get('thumbnail_path') or '')}

    def download(self, url, destination, image=False):
        with self.request(url, stream=True) as r:
            return response_download(r, destination, MAX_IMAGE_BYTES if image else MAX_BYTES, image)

    def download_video(self, row, key, url, destination):
        # Called only after details() validates the live source ID/type/owner.
        cached = local_cache.copy_media(row['source_id'], Path(key).suffix, destination,
                                       expected_size=row.get('file_size'), limit=MAX_BYTES)
        if cached is not None:
            try:
                cached.update(probe_video(destination))
            except RepairError:
                Path(destination).unlink(missing_ok=True)  # Our private copy only.
            else:
                self.log({'id':row['id'], 'status':'local_cache_used', 'kind':'video', **cached})
                return cached
        info = self.download(url, destination)
        info.update(probe_video(destination))
        return info

    def update_size(self, row, size):
        cur = self.db.cursor()
        try:
            self.db.start_transaction()
            cur.execute('''UPDATE photos p JOIN creators c ON c.id=p.creator_id SET p.file_size=%s
                WHERE p.id=%s AND p.type='video' AND p.is_hidden=0 AND p.removed_from_index_at IS NULL
                AND c.is_hidden=0 AND c.removed_from_index_at IS NULL AND c.handle=%s
                AND p.video_url=%s AND p.image_url <=> %s AND p.preview_url <=> %s
                AND p.url_version <=> %s AND p.source_id <=> %s AND p.file_size <=> %s''',
                (size,row['id'],row['handle'],row['video_url'],row['image_url'],row['preview_url'],
                 row['url_version'],row['photo_source_id'],row['file_size']))
            if cur.rowcount != 1:
                raise RepairError('metadata_changed')
            self.db.commit()
        except BaseException:
            self.db.rollback(); raise
        finally:
            cur.close()

    def update_poster(self, row, poster_url, size):
        if row['image_url'] == poster_url and row['file_size'] == size:
            return
        cur = self.db.cursor()
        try:
            self.db.start_transaction()
            cur.execute('''UPDATE photos p JOIN creators c ON c.id=p.creator_id
                JOIN bot_ingested b ON b.source_id=%s AND b.photo_id=p.id SET p.image_url=%s,p.file_size=%s
                WHERE p.id=%s AND p.type='video' AND p.is_hidden=0 AND p.removed_from_index_at IS NULL
                AND c.is_hidden=0 AND c.removed_from_index_at IS NULL AND p.creator_id=%s AND c.handle=%s
                AND p.video_url=%s AND p.image_url <=> %s AND p.preview_url <=> %s
                AND p.url_version <=> %s AND p.source_id <=> %s AND p.file_size <=> %s
                AND b.minio_key=%s''',
                (row['source_id'],poster_url,size,row['id'],row['creator_id'],row['handle'],row['video_url'],
                 row['image_url'],row['preview_url'],row['url_version'],row['photo_source_id'],row['file_size'],row['minio_key']))
            if cur.rowcount != 1:
                raise RepairError('metadata_changed')
            self.db.commit()
        except BaseException:
            self.db.rollback(); raise
        finally:
            cur.close()

    def run(self, expected, apply=False):
        row = self.candidate(expected); video_key, poster_key = validate_candidate(expected, row)
        derived_poster = legacy_poster_url(expected)
        poster_metadata_change = derived_poster is not None and row['image_url'] != derived_poster
        video_head = head(self.s3,self.bucket,video_key); poster_head = head(self.s3,self.bucket,poster_key)
        if derived_poster and poster_head and (poster_head.get('ContentType','').split(';',1)[0].lower() != 'image/webp'
                                               or poster_head.get('ContentLength',0) <= 0):
            raise RepairError('verification_failed')
        if derived_poster and video_head and video_head.get('ContentLength',0) <= 0:
            raise RepairError('verification_failed')
        if video_head and poster_head and not poster_metadata_change:
            return {'id':row['id'],'status':'already_present'}
        details = self.details(row)
        if not apply:
            return {'id':row['id'],'status':'would_restore','video_missing':video_head is None,'poster_missing':poster_head is None,
                    'poster_metadata_change':poster_metadata_change}
        self.journal.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup = self.journal.parent/(row['id']+'-'+str(time.time_ns())+'.before.json')
        private_json(backup, row)
        self.log({'id':row['id'],'status':'started','metadata_backup':str(backup)})
        with tempfile.TemporaryDirectory(prefix='repair-', dir=self.journal.parent) as folder:
            folder = Path(folder); video = folder/'source.video'; poster_ext = Path(poster_key).suffix.lower(); poster = folder/('poster'+poster_ext)
            video_info = None
            video_mime = None
            if video_head is None:
                video_info = self.download_video(row, video_key, details['video'], video)
            if poster_head is None:
                # Prefer the existing source image; otherwise derive one local frame.
                image = folder/'source.image'
                try:
                    if not details['poster']:
                        raise RepairError('source_poster_absent')
                    self.download(details['poster'], image, True)
                    make_poster(image, poster, poster_ext)
                except Exception:
                    if not video.exists():
                        self.download_video(row, video_key, details['video'], video)
                    make_poster(video, poster, poster_ext)
            # Re-check withdrawals and immutable URL identity after network work.
            self.candidate(expected)
            if video_head is None:
                video_mime = 'video/webm' if 'webm' in video_info['format'] else 'video/quicktime' if video_key.lower().endswith('.mov') else 'video/mp4'
                written = put_missing(self.s3,self.bucket,video_key,video,video_mime)
                self.log({'id':row['id'],'status':'video_uploaded' if written else 'video_race_preserved','key':video_key,**video_info})
            self.candidate(expected)
            if poster_head is None:
                mime = {'.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'}[poster_ext]
                written = put_missing(self.s3,self.bucket,poster_key,poster,mime)
                self.log({'id':row['id'],'status':'poster_uploaded' if written else 'poster_race_preserved','key':poster_key,
                          'bytes':poster.stat().st_size,'sha256':hashlib.sha256(poster.read_bytes()).hexdigest()})
            actual = head(self.s3,self.bucket,video_key); actual_poster = head(self.s3,self.bucket,poster_key)
            if (not actual or actual.get('ContentLength',0) <= 0 or not actual_poster
                    or (derived_poster and (actual_poster.get('ContentType','').split(';',1)[0].lower() != 'image/webp'
                                           or actual_poster.get('ContentLength',0) <= 0))):
                raise RepairError('verification_failed')
            # A racing uploader's object is preserved; use its actual stored size.
            row = self.candidate(expected); size = actual['ContentLength']
            if derived_poster:
                self.update_poster(row,derived_poster,size)
            elif size != row['file_size']:
                self.update_size(row,size)
        identity = {'page_urls_unchanged':True,'public_urls_unchanged':not poster_metadata_change,
                    'poster_reference_corrected':poster_metadata_change}
        self.log({'id':row['id'],'status':'restored','bytes':size,**identity})
        return {'id':row['id'],'status':'restored','bytes':size,**identity, **({'codec':video_info['codec'],'mime':video_mime} if video_info else {})}

    def close(self):
        def close_client(client):
            close = getattr(client, 'close', None)
            if callable(close):
                close()
        try:
            close_client(getattr(getattr(self, 'bot', None), 'session', None))
        finally:
            try:
                close_client(getattr(self, 'db', None))
            finally:
                close_client(getattr(self, 's3', None))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan',type=Path);parser.add_argument('--limit',type=int,default=1)
    parser.add_argument('--apply',action='store_true');parser.add_argument('--config',default='/etc/megabot-queue/config.json')
    parser.add_argument('--journal',type=Path,default=Path('/var/lib/video-repair/journal.jsonl'))
    args=parser.parse_args()
    if not 1 <= args.limit <= 100:
        parser.error('--limit must be between 1 and 100')
    rows=json.loads(args.plan.read_text()).get('rows',[])[:args.limit]
    runtime=None;failed=False
    try:
        runtime=Repair(args.config,args.journal)
        for row in rows:
            try:result=runtime.run(row,args.apply)
            except Exception as error:
                failed=True;result={'id':row.get('id'),'status':'failed','reason':str(error) if isinstance(error,RepairError) else type(error).__name__}
                if args.apply:runtime.log(result)
            print(json.dumps(result),flush=True)
    except Exception as error:
        print(json.dumps({'status':'failed','reason':str(error) if isinstance(error,RepairError) else type(error).__name__}),flush=True);return 1
    finally:
        if runtime:runtime.close()
    return int(failed)


if __name__=='__main__':
    raise SystemExit(main())
