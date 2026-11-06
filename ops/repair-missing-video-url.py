#!/usr/bin/env python3
"""Recover the asset references of a proven video from a private checkpoint row."""
from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import tempfile
import time
from urllib.parse import urlsplit
import uuid

_spec = importlib.util.spec_from_file_location('_repair_missing_video_url_base',
                                               Path(__file__).with_name('repair-missing-video-assets.py'))
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)
RepairError = base.RepairError
VIDEO_TYPES = {'.mp4':'video/mp4', '.m4v':'video/mp4', '.mov':'video/quicktime', '.webm':'video/webm'}
IMAGE_EXTENSIONS = {'.jpeg', '.jpg', '.png', '.webp'}
IDENTITY = ('id', 'creator_id', 'handle', 'photo_source_id', 'url_version', 'video_url',
            'image_url', 'preview_url', 'minio_key')


def validate_candidate(expected, actual):
    if not actual or any(actual.get(field) for field in ('is_hidden', 'creator_hidden',
                                                         'removed_from_index_at', 'creator_removed')):
        raise RepairError('excluded')
    if actual['type'] != 'video' or (actual['video_url'] or '').strip():
        raise RepairError('candidate_changed')
    if any(actual.get(field) != expected.get(field) for field in IDENTITY):
        raise RepairError('candidate_changed')
    try:
        uuid.UUID(actual['id'])
    except (TypeError, ValueError, AttributeError):
        raise RepairError('candidate_invalid') from None
    sid = str(actual['source_id'])
    handle = actual['handle']
    if (not re.fullmatch(r'[1-9][0-9]{0,18}', sid) or sid != str(expected.get('source_id'))
            or (actual['photo_source_id'] is not None and sid != str(actual['photo_source_id']))
            or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}', handle)
            or actual['registry_handle'] != handle):
        raise RepairError('registry_changed')
    key = actual['minio_key']
    stem = f'creators/{handle}/{sid}'
    suffix = Path(key).suffix
    extension = suffix.lower()
    if key != stem + suffix or extension not in VIDEO_TYPES.keys() | IMAGE_EXTENSIONS:
        raise RepairError('registry_key_changed')
    if extension in IMAGE_EXTENSIONS and base.object_key(actual['image_url']) != key:
        raise RepairError('registry_key_changed')
    return stem, extension


class Repair(base.Repair):
    def _candidate(self, cursor, expected, lock=False):
        cursor.execute('''SELECT p.id,p.source_id photo_source_id,p.type,p.file_size,p.url_version,
            p.video_url,p.image_url,p.preview_url,p.is_hidden,p.removed_from_index_at,
            c.id creator_id,c.handle,c.is_hidden creator_hidden,c.removed_from_index_at creator_removed,
            b.source_id,b.minio_key,b.creator_handle registry_handle
            FROM photos p JOIN creators c ON c.id=p.creator_id
            JOIN bot_ingested b ON b.source_id=%s AND b.photo_id=p.id WHERE p.id=%s'''
            + (' FOR UPDATE' if lock else ''), (expected['source_id'], expected['id']))
        row = cursor.fetchone()
        validate_candidate(expected, row)
        for table, fields in [('dmca_notices', 'urls'), ('dmca_mail_events', 'urls,targets')]:
            cursor.execute('SELECT ' + fields + ' FROM ' + table)
            if any(base.notice_matches(row, notice) for notice in cursor.fetchall()):
                raise RepairError('notice_excluded')
        return row

    def candidate(self, expected):
        cursor = self.db.cursor(dictionary=True)
        try:
            cursor.execute('SET SESSION max_statement_time=8')
            self.db.start_transaction(readonly=True)
            return self._candidate(cursor, expected)
        finally:
            self.db.rollback()
            cursor.close()

    def video_source(self, expected, row):
        with self.request(self.source.Config.BASE_URL + '/media/' + str(row['source_id'])) as response:
            if response.status_code != 200:
                if response.status_code in (401, 403, 404, 410):
                    raise RepairError('source_unavailable')
                raise RepairError('source_http_' + str(response.status_code))
            details = response.json()
        if (not isinstance(details, dict) or details.get('error') or details.get('errors')
                or any(details.get(flag) for flag in ('removed', 'is_removed', 'is_hidden', 'removed_at'))
                or str(details.get('id') or details.get('media_id') or '') != str(row['source_id'])
                or self.source.extract_handle(details).casefold() != row['handle'].casefold()):
            raise RepairError('source_excluded')
        if details.get('is_video') is not True:
            raise RepairError('source_not_matching_video')
        path = details.get('file_path') or details.get('url')
        if not isinstance(path, str) or not path or len(path) > 2048:
            raise RepairError('source_video_path_invalid')
        audited = expected.get('source_api', {}).get(str(row['source_id']))
        if audited is not None and (not isinstance(audited, dict) or audited.get('file_path') != path
                                    or audited.get('is_video') is not True):
            raise RepairError('source_video_changed')
        url = base.source_url(self.source.cdn_url(path))
        extension = Path(urlsplit(url).path).suffix.lower()
        if extension not in VIDEO_TYPES:
            raise RepairError('source_video_path_invalid')
        return path, url, extension

    def update_links(self, expected, video_key, poster_key, size):
        cursor = self.db.cursor(dictionary=True)
        try:
            self.db.start_transaction(isolation_level='READ COMMITTED')
            row = self._candidate(cursor, expected, lock=True)
            if row['file_size'] != expected['file_size']:
                raise RepairError('metadata_changed')
            cursor.execute('''UPDATE photos SET video_url=%s,image_url=%s,file_size=%s
                WHERE id=%s AND type='video' AND video_url <=> %s AND image_url <=> %s
                AND file_size <=> %s AND is_hidden=0 AND removed_from_index_at IS NULL''',
                ('/media/' + video_key, '/media/' + poster_key, size, row['id'], row['video_url'],
                 row['image_url'], row['file_size']))
            if cursor.rowcount != 1:
                raise RepairError('metadata_changed')
            if video_key != row['minio_key']:
                cursor.execute('''UPDATE bot_ingested SET minio_key=%s
                    WHERE source_id=%s AND photo_id=%s AND creator_handle=%s AND minio_key=%s''',
                    (video_key, row['source_id'], row['id'], row['registry_handle'], row['minio_key']))
                if cursor.rowcount != 1:
                    raise RepairError('registry_changed')
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise
        finally:
            cursor.close()

    def object_metadata(self, key, size, mime):
        metadata = base.head(self.s3, self.bucket, key)
        if (not metadata or metadata.get('ContentLength') != size or not metadata.get('ETag')
                or metadata.get('ContentType', '').split(';', 1)[0].lower() != mime):
            raise RepairError('verification_failed')
        return metadata

    def put_or_verify(self, key, path, mime, info):
        written = base.put_missing(self.s3, self.bucket, key, path, mime)
        metadata = self.object_metadata(key, info['bytes'], mime)
        if not written:
            deadline = time.monotonic() + base.STORED_VIDEO_READ_SECONDS
            response = self.s3.get_object(Bucket=self.bucket, Key=key, IfMatch=metadata['ETag'])
            with closing(response['Body']) as body:
                if (response.get('ContentLength') != info['bytes'] or response.get('ETag') != metadata['ETag']
                        or response.get('ResponseMetadata', {}).get('HTTPStatusCode') != 200):
                    raise RepairError('stored_object_changed')
                digest = hashlib.sha256()
                size = 0
                for chunk in body.iter_chunks(chunk_size=1024 * 1024):
                    size += len(chunk)
                    if size > info['bytes'] or time.monotonic() >= deadline:
                        raise RepairError('stored_object_changed')
                    digest.update(chunk)
                if size != info['bytes'] or digest.hexdigest() != info['sha256']:
                    raise RepairError('stored_object_changed')
        return metadata['ETag'], written

    def run(self, expected, apply=False):
        row = self.candidate(expected)
        stem, registry_extension = validate_candidate(expected, row)
        approved = self.video_source(expected, row)
        _, source_url, extension = approved
        if registry_extension in VIDEO_TYPES:
            if (registry_extension == '.webm') != (extension == '.webm'):
                raise RepairError('source_video_format_changed')
            video_key = row['minio_key']
            extension = registry_extension
        else:
            video_key = stem + extension
        mime = VIDEO_TYPES[extension]
        stored = base.head(self.s3, self.bucket, video_key)
        if not apply:
            return {'status':'would_restore', 'stored_main':stored is not None}
        self.journal.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup = self.journal.parent / (row['id'] + '-' + str(time.time_ns()) + '.before.json')
        base.private_json(backup, row)
        with tempfile.TemporaryDirectory(prefix='video-url-repair-', dir=self.journal.parent) as directory:
            video = Path(directory) / 'main.video'
            poster = Path(directory) / 'poster.webp'
            if stored and video_key == row['minio_key']:
                self.object_metadata(video_key, stored.get('ContentLength'), mime)
                video_etag = self.download_stored_video(video_key, stored, video)
                info = {'bytes':stored['ContentLength']}
            else:
                info = self.download(source_url, video)
            probe = base.probe_video(video)
            formats = probe['format'].split(',')
            if not (('webm' in formats) if extension == '.webm' else ('mp4' in formats or 'mov' in formats)):
                raise RepairError('source_video_format_changed')
            base.make_poster(video, poster, '.webp')
            poster_bytes = poster.read_bytes()
            if not (poster_bytes.startswith(b'RIFF') and poster_bytes[8:12] == b'WEBP'):
                raise RepairError('poster_generation_failed')
            poster_digest = hashlib.sha256(poster_bytes).hexdigest()
            poster_key = stem + '_repair_' + poster_digest[:24] + '_thumb.webp'
            if self.video_source(expected, row) != approved:
                raise RepairError('source_video_changed')
            self.candidate(expected)
            if not (stored and video_key == row['minio_key']):
                video_etag, _ = self.put_or_verify(video_key, video, mime, info)
            self.candidate(expected)
            poster_etag, _ = self.put_or_verify(poster_key, poster, 'image/webp',
                                               {'bytes':len(poster_bytes), 'sha256':poster_digest})
            if (self.object_metadata(video_key, info['bytes'], mime)['ETag'] != video_etag
                    or self.object_metadata(poster_key, len(poster_bytes), 'image/webp')['ETag'] != poster_etag):
                raise RepairError('stored_object_changed')
            self.update_links(expected, video_key, poster_key, info['bytes'])
        self.log({'id':row['id'], 'status':'video_url_restored', 'metadata_backup':str(backup)})
        return {'id':row['id'], 'status':'restored'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkpoint', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--config', default='/etc/megabot-queue/config.json')
    parser.add_argument('--journal', type=Path, default=Path('/var/lib/video-repair/video-url-journal.jsonl'))
    args = parser.parse_args()
    runtime = None
    try:
        expected = json.loads(args.checkpoint.read_bytes())
        runtime = Repair(args.config, args.journal)
        result = runtime.run(expected, args.apply)
        print(json.dumps({key:value for key,value in result.items() if key != 'id'}))
        return 0
    except Exception as error:
        reason = str(error) if isinstance(error, RepairError) else type(error).__name__
        print(json.dumps({'status':'failed', 'reason':reason}))
        return 1
    finally:
        if runtime is not None:
            runtime.close()


if __name__ == '__main__':
    raise SystemExit(main())
