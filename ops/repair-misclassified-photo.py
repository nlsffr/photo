#!/usr/bin/env python3
"""Restore an ordinary or misclassified original photo, preserving public IDs.

Dry-run by default. The private plan must pin the DB row and the source file_path
observed during audit. Existing storage objects are never overwritten.
"""
from __future__ import annotations
import argparse
from contextlib import closing
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

_spec = importlib.util.spec_from_file_location('missing_video_assets', Path(__file__).with_name('repair-missing-video-assets.py'))
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)
RepairError = base.RepairError
MIMES = {'.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp'}
IDENTITY = ('id','creator_id','handle','photo_source_id','url_version','video_url','image_url','preview_url','minio_key')
LEGACY_WEBP_MIME = 'binary/octet-stream'


def validate_candidate(expected, actual):
    if not actual or actual.get('is_hidden') or actual.get('creator_hidden') or actual.get('removed_from_index_at') or actual.get('creator_removed'):
        raise RepairError('excluded')
    if actual.get('type') not in ('photo', 'video') or actual.get('video_url') is not None:
        raise RepairError('not_a_photo_candidate')
    if (actual.get('type') != expected.get('type')
            and not (expected.get('type') == 'video' and actual.get('type') == 'photo')):
        raise RepairError('candidate_changed')
    try:
        uuid.UUID(actual['id'])
    except (ValueError, TypeError, KeyError):
        raise RepairError('invalid_photo_id') from None
    for field in IDENTITY:
        if actual.get(field) != expected.get(field):
            raise RepairError('candidate_changed')
    source_id = actual.get('source_id')
    if (not isinstance(source_id, (str, int)) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', str(source_id))
            or str(source_id) != str(expected.get('source_id'))
            or (actual.get('photo_source_id') is not None and str(source_id) != str(actual['photo_source_id']))):
        raise RepairError('registry_changed')
    key = base.object_key(actual.get('image_url'))
    if key != actual.get('minio_key') or Path(key).suffix.lower() not in MIMES:
        raise RepairError('invalid_photo_key')
    return key


def validate_source(expected, row, details, source):
    if (not isinstance(details, dict) or details.get('is_video') is not False
            or details.get('error') or details.get('errors')
            or any(details.get(x) for x in ('removed','is_removed','is_hidden','removed_at'))
            or source.extract_handle(details).casefold() != row['handle'].casefold()):
        raise RepairError('source_not_matching_photo')
    sid = details.get('id') or details.get('media_id')
    if sid is None or str(sid) != str(row['source_id']):
        raise RepairError('source_id_changed')
    audited = expected.get('source_api', {}).get(str(row['source_id']), {})
    current_path = details.get('file_path') or details.get('url')
    if not current_path or current_path != audited.get('file_path') or audited.get('is_video') is not False:
        raise RepairError('source_photo_changed')
    return base.source_url(source.cdn_url(current_path))


def reencode_image(input_path, output_path, extension):
    codec = {'.jpg':'mjpeg','.jpeg':'mjpeg','.png':'png','.webp':'libwebp'}[extension]
    try:
        # Full resolution: no scale/crop filter, no thumbnail fallback.
        command = ['ffmpeg','-nostdin','-v','error','-i',str(input_path),'-map','0:v:0','-frames:v','1','-c:v',codec]
        if codec == 'mjpeg': command += ['-q:v','2']
        subprocess.run(command+[str(output_path)], capture_output=True, timeout=60, check=True)
        size = Path(output_path).stat().st_size
        with Path(output_path).open('rb') as stream: magic = stream.read(12)
        valid = (magic.startswith(b'\xff\xd8\xff') if extension in ('.jpg','.jpeg') else
                 magic.startswith(b'\x89PNG\r\n\x1a\n') if extension == '.png' else
                 magic.startswith(b'RIFF') and magic[8:12] == b'WEBP')
        if size <= 0 or not valid: raise ValueError()
        return {'bytes':size,'sha256':hashlib.sha256(Path(output_path).read_bytes()).hexdigest()}
    except Exception:
        raise RepairError('full_image_conversion_failed') from None


def verify_stored_webp(path, size):
    with Path(path).open('rb') as stream:
        signature = stream.read(12)
    if (len(signature) != 12 or signature[:4] != b'RIFF' or signature[8:12] != b'WEBP'
            or int.from_bytes(signature[4:8], 'little') + 8 != size):
        raise RepairError('stored_webp_signature_rejected')
    try:
        subprocess.run(
            ['ffmpeg', '-nostdin', '-v', 'error', '-xerror', '-abort_on', 'empty_output',
             '-max_alloc', '67108864', '-threads', '1', '-max_pixels', '16000000',
             '-f', 'webp_pipe', '-i', str(path), '-map', '0:v:0', '-f', 'null', '-'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=True,
        )
    except (OSError, subprocess.SubprocessError):
        raise RepairError('stored_webp_decode_failed') from None


class Repair(base.Repair):
    def candidate(self, expected):
        cur = self.db.cursor(dictionary=True)
        try:
            cur.execute('SET SESSION max_statement_time=8')
            self.db.start_transaction(readonly=True)
            cur.execute('''SELECT p.id,p.source_id photo_source_id,p.type,p.file_size,p.url_version,p.video_url,p.image_url,p.preview_url,
                p.is_hidden,p.removed_from_index_at,c.id creator_id,c.handle,c.is_hidden creator_hidden,c.removed_from_index_at creator_removed,
                b.source_id,b.minio_key FROM photos p JOIN creators c ON c.id=p.creator_id
                JOIN bot_ingested b ON b.source_id=%s AND b.photo_id=p.id
                WHERE p.id=%s AND p.type IN ('photo','video') AND p.video_url IS NULL''',
                (expected['source_id'], expected['id']))
            row = cur.fetchone(); validate_candidate(expected, row)
            for table, fields in [('dmca_notices','urls'),('dmca_mail_events','urls,targets')]:
                cur.execute('SELECT '+fields+' FROM '+table)
                if any(base.notice_matches(row, notice) for notice in cur.fetchall()):
                    raise RepairError('notice_excluded')
            return row
        finally:
            self.db.rollback(); cur.close()

    def photo_details(self, row):
        with self.request(self.source.Config.BASE_URL+'/media/'+str(row['source_id'])) as response:
            if response.status_code != 200:
                if response.status_code in (401,403,404,410): raise RepairError('source_unavailable')
                raise RepairError('source_http_' + str(response.status_code))
            return response.json()

    def photo_source(self, expected, row):
        return validate_source(expected, row, self.photo_details(row), self.source)

    def repair_legacy_webp(self, expected, apply=False):
        """Reclassify a browser-verified legacy WebP without replacing its object."""
        if expected.get('type') != 'video':
            raise RepairError('not_a_misclassified_photo')
        row = self.candidate(expected)
        key = validate_candidate(expected, row)
        original = base.head(self.s3, self.bucket, key) or {}
        size, etag = original.get('ContentLength'), original.get('ETag')
        if (original.get('ContentType') != LEGACY_WEBP_MIME or type(size) is not int
                or not 0 < size <= base.MAX_IMAGE_BYTES or not isinstance(etag, str)
                or not re.fullmatch(r'"[A-Za-z0-9-]{1,128}"', etag)):
            raise RepairError('legacy_webp_metadata_rejected')

        details = self.photo_details(row)
        if not isinstance(details, dict):
            raise RepairError('source_not_matching_photo')
        source_id = str(row['source_id'])
        observed = {'is_video':details.get('is_video'), 'file_path':details.get('file_path') or details.get('url')}
        audited = {**expected, 'source_api':expected.get('source_api', {source_id:observed})}
        validate_source(audited, row, details, self.source)

        with tempfile.TemporaryDirectory(prefix='legacy-webp-verification-') as folder:
            path = Path(folder) / 'stored.webp'
            try:
                response = self.s3.get_object(Bucket=self.bucket, Key=key, IfMatch=etag)
                with closing(response['Body']) as body:
                    if (response.get('ResponseMetadata', {}).get('HTTPStatusCode') != 200
                            or response.get('ETag') != etag or response.get('ContentLength') != size
                            or response.get('ContentType') != LEGACY_WEBP_MIME):
                        raise RepairError('legacy_webp_metadata_changed')
                    base.stream_download(body.iter_chunks(chunk_size=1024 * 1024), path, size,
                                         LEGACY_WEBP_MIME, size, image=True, deadline=time.monotonic() + 45)
            except RepairError:
                raise
            except Exception:
                raise RepairError('legacy_webp_read_failed') from None
            verify_stored_webp(path, size)

        current = self.candidate(expected)
        self.photo_source(audited, current)
        latest = base.head(self.s3, self.bucket, key) or {}
        if (latest.get('ETag'), latest.get('ContentLength'), latest.get('ContentType')) != (etag, size, LEGACY_WEBP_MIME):
            raise RepairError('legacy_webp_metadata_changed')
        current = self.candidate(expected)
        if current['type'] == 'photo' and current['file_size'] == size:
            status = 'already_present'
        elif not apply:
            status = 'would_reclassify'
        else:
            self.journal.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            backup = self.journal.parent / (row['id'] + '-' + str(time.time_ns()) + '.before.json')
            base.private_json(backup, current)
            self.log({'id':row['id'], 'status':'started_photo', 'metadata_backup':str(backup)})
            self.update_photo(current, size)
            self.log({'id':row['id'], 'status':'photo_restored', 'bytes':size, 'public_urls_unchanged':True})
            status = 'photo_restored'
        return {'id':row['id'], 'status':status, 'bytes':size, 'public_urls_unchanged':True}

    def update_photo(self, row, size):
        if row['type'] == 'photo' and size == row['file_size']:
            return
        cur = self.db.cursor()
        try:
            self.db.start_transaction()
            cur.execute('''UPDATE photos p JOIN creators c ON c.id=p.creator_id
                JOIN bot_ingested b ON b.source_id=%s AND b.photo_id=p.id SET p.type='photo',p.file_size=%s
                WHERE p.id=%s AND p.type=%s AND p.video_url IS NULL
                AND p.is_hidden=0 AND p.removed_from_index_at IS NULL
                AND c.is_hidden=0 AND c.removed_from_index_at IS NULL
                AND p.creator_id=%s AND c.handle=%s AND p.image_url=%s AND p.preview_url <=> %s
                AND p.source_id <=> %s AND p.url_version <=> %s AND p.file_size <=> %s
                AND b.source_id=%s AND b.minio_key=%s''',
                (row['source_id'],size,row['id'],row['type'],row['creator_id'],row['handle'],row['image_url'],row['preview_url'],
                 row['photo_source_id'],row['url_version'],row['file_size'],row['source_id'],row['minio_key']))
            if cur.rowcount != 1: raise RepairError('metadata_changed')
            self.db.commit()
        except BaseException:
            self.db.rollback(); raise
        finally:
            cur.close()

    def run(self, expected, apply=False):
        row = self.candidate(expected); key = validate_candidate(expected,row)
        original = base.head(self.s3,self.bucket,key)
        source_url = self.photo_source(expected,row)
        if original and (original.get('ContentType','').split(';',1)[0].lower() != MIMES[Path(key).suffix.lower()]
                         or original.get('ContentLength',0) <= 0):
            raise RepairError('existing_object_not_matching_image')
        if original and row['type'] == 'photo' and original['ContentLength'] == row['file_size']:
            return {'id':row['id'],'status':'already_present','bytes':original['ContentLength'],'public_urls_unchanged':True}
        if not apply:
            return {'id':row['id'],'status':'would_reclassify' if row['type']=='video' else 'would_restore',
                    'photo_missing':original is None,'public_urls_unchanged':True}
        self.journal.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        backup = self.journal.parent/(row['id']+'-'+str(time.time_ns())+'.before.json')
        base.private_json(backup,row)
        self.log({'id':row['id'],'status':'started_photo','metadata_backup':str(backup)})
        with tempfile.TemporaryDirectory(prefix='photo-repair-',dir=self.journal.parent) as folder:
            if original is None:
                folder = Path(folder); downloaded = folder/'source.image'; extension = Path(key).suffix.lower(); image = folder/('full-image'+extension)
                cached = base.local_cache.copy_media(row['source_id'], Path(key).suffix, downloaded,
                                                    expected_size=row.get('file_size'), limit=base.MAX_IMAGE_BYTES)
                if cached is not None:
                    try:
                        info = reencode_image(downloaded,image,extension)
                    except RepairError:
                        downloaded.unlink(missing_ok=True); image.unlink(missing_ok=True)
                        cached = None
                if cached is None:
                    with self.request(source_url,stream=True) as response:
                        base.response_download(response,downloaded,base.MAX_IMAGE_BYTES,image=True)
                    info = reencode_image(downloaded,image,extension)
                else:
                    self.log({'id':row['id'], 'status':'local_cache_used', 'kind':'photo', **cached})
                self.candidate(expected)
                written = base.put_missing(self.s3,self.bucket,key,image,MIMES[extension])
                self.log({'id':row['id'],'status':'photo_uploaded' if written else 'photo_race_preserved','key':key,**info})
            actual = base.head(self.s3,self.bucket,key)
            if (not actual or actual.get('ContentLength',0) <= 0
                    or actual.get('ContentType','').split(';',1)[0].lower() != MIMES[Path(key).suffix.lower()]):
                raise RepairError('photo_verification_failed')
            # Recheck identity and withdrawals after storage work, immediately before SQL.
            self.candidate(expected)
            size = actual['ContentLength']; self.update_photo(row,size)
        self.log({'id':row['id'],'status':'photo_restored','bytes':size,'public_urls_unchanged':True})
        return {'id':row['id'],'status':'photo_restored','bytes':size,'public_urls_unchanged':True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan',type=Path);parser.add_argument('--id',help='explicit row UUID when the private plan contains several rows')
    parser.add_argument('--apply',action='store_true');parser.add_argument('--config',default='/etc/megabot-queue/config.json')
    parser.add_argument('--legacy-webp', action='store_true',
                        help='verify one browser-tested legacy WebP and only correct its catalogue classification')
    parser.add_argument('--journal',type=Path,default=Path('/var/lib/video-repair/photo-journal.jsonl'))
    args=parser.parse_args(); runtime=None
    try:
        rows=json.loads(args.plan.read_text()).get('rows',[])
        if args.id: rows=[row for row in rows if row.get('id')==args.id]
        if len(rows)!=1: raise RepairError('one_explicit_photo_required')
        runtime=Repair(args.config,args.journal)
        repair = runtime.repair_legacy_webp if args.legacy_webp else runtime.run
        print(json.dumps(repair(rows[0],args.apply)),flush=True);return 0
    except Exception as error:
        reason=str(error) if isinstance(error,RepairError) else type(error).__name__
        result={'status':'failed','reason':reason}
        if args.apply and runtime: runtime.log(result)
        print(json.dumps(result),flush=True);return 1
    finally:
        if runtime: runtime.close()

if __name__=='__main__': raise SystemExit(main())
