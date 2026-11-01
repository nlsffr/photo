#!/usr/bin/env python3
"""Restore a missing original photo misclassified as video, preserving public IDs.

Dry-run by default. The private plan must pin the DB row and the source file_path
observed during audit. Existing storage objects are never overwritten.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
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
IDENTITY = ('id','creator_id','handle','type','photo_source_id','file_size','url_version','video_url','image_url','preview_url','minio_key')


def validate_candidate(expected, actual):
    if not actual or actual.get('is_hidden') or actual.get('creator_hidden') or actual.get('removed_from_index_at') or actual.get('creator_removed'):
        raise RepairError('excluded')
    if actual.get('type') != 'video' or actual.get('video_url') is not None:
        raise RepairError('not_a_misclassified_photo')
    try:
        uuid.UUID(actual['id'])
    except (ValueError, TypeError, KeyError):
        raise RepairError('invalid_photo_id') from None
    for field in IDENTITY:
        if actual.get(field) != expected.get(field):
            raise RepairError('candidate_changed')
    if (not actual.get('photo_source_id') or str(actual.get('source_id')) != str(actual['photo_source_id'])
            or str(actual.get('source_id')) != str(expected.get('source_id'))):
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
    if sid is not None and str(sid) != str(row['source_id']):
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


class Repair(base.Repair):
    def candidate(self, expected):
        cur = self.db.cursor(dictionary=True)
        try:
            cur.execute('SET SESSION max_statement_time=8')
            self.db.start_transaction(readonly=True)
            cur.execute('''SELECT p.id,p.source_id photo_source_id,p.type,p.file_size,p.url_version,p.video_url,p.image_url,p.preview_url,
                p.is_hidden,p.removed_from_index_at,c.id creator_id,c.handle,c.is_hidden creator_hidden,c.removed_from_index_at creator_removed,
                b.source_id,b.minio_key FROM photos p JOIN creators c ON c.id=p.creator_id
                JOIN bot_ingested b ON b.photo_id=p.id WHERE p.id=%s''', (expected['id'],))
            row = cur.fetchone(); validate_candidate(expected, row)
            for table, fields in [('dmca_notices','urls'),('dmca_mail_events','urls,targets')]:
                cur.execute('SELECT '+fields+' FROM '+table)
                if any(base.notice_matches(row, notice) for notice in cur.fetchall()):
                    raise RepairError('notice_excluded')
            return row
        finally:
            self.db.rollback(); cur.close()

    def photo_source(self, expected, row):
        with self.request(self.source.Config.BASE_URL+'/media/'+str(row['source_id'])) as response:
            if response.status_code != 200: raise RepairError('source_unavailable')
            details = response.json()
        return validate_source(expected, row, details, self.source)

    def update_photo(self, row, size):
        cur = self.db.cursor()
        try:
            self.db.start_transaction()
            cur.execute('''UPDATE photos p JOIN creators c ON c.id=p.creator_id
                JOIN bot_ingested b ON b.photo_id=p.id SET p.type='photo',p.file_size=%s
                WHERE p.id=%s AND p.type='video' AND p.video_url IS NULL
                AND p.is_hidden=0 AND p.removed_from_index_at IS NULL
                AND c.is_hidden=0 AND c.removed_from_index_at IS NULL
                AND p.creator_id=%s AND c.handle=%s AND p.image_url=%s AND p.preview_url <=> %s
                AND p.source_id <=> %s AND p.url_version <=> %s AND p.file_size <=> %s
                AND b.source_id=%s AND b.minio_key=%s''',
                (size,row['id'],row['creator_id'],row['handle'],row['image_url'],row['preview_url'],
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
        if not apply:
            return {'id':row['id'],'status':'would_reclassify','photo_missing':original is None,'public_urls_unchanged':True}
        self.journal.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        backup = self.journal.parent/(row['id']+'-'+str(time.time_ns())+'.before.json')
        base.private_json(backup,row)
        self.log({'id':row['id'],'status':'started_photo','metadata_backup':str(backup)})
        with tempfile.TemporaryDirectory(prefix='photo-repair-',dir=self.journal.parent) as folder:
            if original is None:
                folder = Path(folder); downloaded = folder/'source.image'; extension = Path(key).suffix.lower(); image = folder/('full-image'+extension)
                with self.request(source_url,stream=True) as response:
                    base.response_download(response,downloaded,base.MAX_IMAGE_BYTES,image=True)
                info = reencode_image(downloaded,image,extension)
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
    parser.add_argument('--journal',type=Path,default=Path('/var/lib/video-repair/photo-journal.jsonl'))
    args=parser.parse_args(); runtime=None
    try:
        rows=json.loads(args.plan.read_text()).get('rows',[])
        if args.id: rows=[row for row in rows if row.get('id')==args.id]
        if len(rows)!=1: raise RepairError('one_explicit_photo_required')
        runtime=Repair(args.config,args.journal)
        print(json.dumps(runtime.run(rows[0],args.apply)),flush=True);return 0
    except Exception as error:
        reason=str(error) if isinstance(error,RepairError) else type(error).__name__
        result={'status':'failed','reason':reason}
        if args.apply and runtime: runtime.log(result)
        print(json.dumps(result),flush=True);return 1
    finally:
        if runtime: runtime.close()

if __name__=='__main__': raise SystemExit(main())
