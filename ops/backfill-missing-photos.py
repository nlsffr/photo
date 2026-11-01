#!/usr/bin/env python3
"""Prepare and resume exact-identity photo restorations using existing repair code.

Plans are SQL-only snapshots. Every execution proves the current source is a photo,
then the photo repairer independently checks that same source path again.
"""
from __future__ import annotations

import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path
import re
import signal
import time
import types


def load_sibling(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    if spec is None or spec.loader is None:
        raise RuntimeError('repair_module_unavailable')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


shared = load_sibling('_photo_backfill_shared', 'backfill-missing-video-assets.py')
photo = load_sibling('_photo_backfill_repair', 'repair-misclassified-photo.py')
PHOTO_SKIPS = frozenset('''not_a_photo_candidate not_a_misclassified_photo
source_not_matching_photo source_id_changed source_photo_changed invalid_photo_id
invalid_photo_key existing_object_not_matching_image photo_verification_failed'''.split())
# This is our isolated instance of the shared driver, not a mutation of its file.
shared.SKIP_CODES = shared.SKIP_CODES | PHOTO_SKIPS


def inventory_ids(inventory, video_review=None):
    if (not isinstance(inventory, dict) or inventory.get('complete_for_local_photo_prefixes') is not True
            or type(inventory.get('active_photos_snapshot')) is not int
            or not isinstance(inventory.get('missing_rows'), list)):
        raise shared.BackfillError('incomplete_photo_inventory')
    ids = set()
    for row in inventory['missing_rows']:
        value = row.get('id') if isinstance(row, dict) else None
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
            raise shared.BackfillError('inventory_id_invalid')
        ids.add(value)
    if video_review is not None:
        if (not isinstance(video_review, dict) or video_review.get('version') != 1
                or not isinstance(video_review.get('review'), list)):
            raise shared.BackfillError('video_review_plan_invalid')
        for row in video_review['review']:
            if not isinstance(row, dict) or row.get('reason') != 'video_url_empty':
                continue
            value = row.get('id')
            if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
                raise shared.BackfillError('inventory_id_invalid')
            ids.add(value)
    return sorted(ids)


def source_id_for(row):
    value = row.get('photo_source_id')
    if value is None:
        value = Path(photo.base.object_key(row.get('image_url'))).stem
    value = str(value)
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
        raise shared.BackfillError('source_id_unusable')
    return value


def prepare_plan(inventory, db, digest, *, video_review=None, video_digest=None, now=None):
    ids = inventory_ids(inventory, video_review)
    rows, review = [], []
    for offset in range(0, len(ids), 100):
        subset = ids[offset:offset + 100]
        cur = db.cursor(dictionary=True)
        try:
            cur.execute('SET SESSION max_statement_time=15')
            db.start_transaction(readonly=True)
            cur.execute('''SELECT p.id,p.source_id photo_source_id,p.type,p.file_size,p.url_version,
                p.video_url,p.image_url,p.preview_url,p.is_hidden,p.removed_from_index_at,
                c.id creator_id,c.handle,c.is_hidden creator_hidden,c.removed_from_index_at creator_removed
                FROM photos p JOIN creators c ON c.id=p.creator_id
                WHERE p.id IN (''' + ','.join(['%s'] * len(subset)) + ''')
                AND p.type IN ('photo','video') AND p.video_url IS NULL
                AND p.is_hidden=0 AND p.removed_from_index_at IS NULL
                AND c.is_hidden=0 AND c.removed_from_index_at IS NULL''', subset)
            actual = {r['id']: r for r in cur.fetchall()}
            candidates = []
            for photo_id in subset:
                row = actual.get(photo_id)
                if row is None:
                    review.append({'id':photo_id,'reason':'inactive_or_missing'}); continue
                try:
                    sid = source_id_for(row)
                except Exception:
                    review.append({'id':photo_id,'reason':'source_id_unusable'}); continue
                candidates.append((row, sid))
            source_ids = list(dict.fromkeys(sid for _, sid in candidates))
            registry = {}
            if source_ids:
                cur.execute('SELECT source_id,photo_id,minio_key FROM bot_ingested WHERE source_id IN ('
                            + ','.join(['%s'] * len(source_ids)) + ')', source_ids)
                registry = {str(r['source_id']):r for r in cur.fetchall()}
            for row, sid in candidates:
                entry = registry.get(sid)
                if entry is None or entry['photo_id'] != row['id']:
                    review.append({'id':row['id'],'reason':'registry_unresolved'}); continue
                expected = {**row,'source_id':entry['source_id'],'minio_key':entry['minio_key']}
                try:
                    photo.validate_candidate(expected, expected)
                except Exception as error:
                    reason = str(error) if isinstance(error, photo.RepairError) else 'candidate_invalid'
                    review.append({'id':row['id'],'reason':reason if re.fullmatch(r'[a-z0-9_]{1,80}',reason) else 'candidate_invalid'}); continue
                rows.append(expected)
        finally:
            db.rollback(); cur.close()
    # Queue priority changes only the private repair plan, never the site's order.
    rows.sort(key=lambda row:(row['handle'].casefold() != 'hannahowo', row['id']))
    return {'version':1,'kind':'photo-assets','created_at':time.time() if now is None else now,
            'inventory_sha256':digest,'video_review_sha256':video_digest,
            'summary':{'requested_ids':len(ids),'planned_rows':len(rows),'review_rows':len(review),
                       'priority_creator_rows':sum(r['handle'].casefold()=='hannahowo' for r in rows),
                       'review_reasons':dict(Counter(r['reason'] for r in review))},
            'rows':rows,'review':review}


class Runtime:
    def __init__(self, config, journal):
        self.photo = photo.Repair(config, journal)

    def run(self, expected, apply=False):
        if apply is not True:
            raise photo.RepairError('apply_required')
        # This first validation also excludes notices before any source request.
        row = self.photo.candidate(expected)
        with self.photo.request(self.photo.source.Config.BASE_URL+'/media/'+str(row['source_id'])) as response:
            status = response.status_code
            if status != 200:
                if status in (401,403,404,410): raise photo.RepairError('source_unavailable')
                raise photo.RepairError('source_http_' + str(status))
            details = response.json()
        if not isinstance(details, dict):
            raise photo.RepairError('source_not_matching_photo')
        path = details.get('file_path') or details.get('url')
        audited = {**expected, 'source_api':{str(row['source_id']):{'file_path':path,'is_video':details.get('is_video')}}}
        # Strict bool, owner and ID checks; never infer a video from missing data.
        photo.validate_source(audited, row, details, self.photo.source)
        result = self.photo.run(audited, apply=True)
        if result.get('status') == 'photo_restored':
            return {**result,'status':'restored'}
        return result

    def close(self):
        self.photo.close()


def run_plan(plan, digest, state_dir, config, *, max_items=1, delay=2, lock_dir=None, **kwargs):
    if plan.get('kind') != 'photo-assets' or delay < 2:
        raise shared.BackfillError('photo_run_limits_invalid')
    adapter = types.SimpleNamespace(Repair=Runtime, RepairError=photo.RepairError)
    return shared.run_plan(plan, digest, state_dir, adapter, config,
                           max_items=max_items, delay=delay, lock_dir=lock_dir, **kwargs)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--prepare-plan', action='store_true'); mode.add_argument('--run', action='store_true')
    parser.add_argument('--inventory', type=Path); parser.add_argument('--video-review-plan', type=Path)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--config', default='/etc/megabot-queue/config.json')
    parser.add_argument('--state-dir', type=Path, default=Path('/var/lib/photo-repair/backfill'))
    parser.add_argument('--job-lock-dir', type=Path, default=Path('/var/lib/video-repair/job-locks'))
    parser.add_argument('--max-items', type=int, default=1); parser.add_argument('--delay', type=float, default=2)
    args = parser.parse_args(argv)
    try:
        if args.prepare_plan:
            if args.inventory is None:parser.error('--inventory is required with --prepare-plan')
            inventory,digest = shared.read_private_json(args.inventory)
            video,video_digest = shared.read_private_json(args.video_review_plan) if args.video_review_plan else (None,None)
            db = shared.connect_readonly(args.config)
            try:
                plan = prepare_plan(inventory,db,digest,video_review=video,video_digest=video_digest)
            finally:
                db.close()
            shared.private_directory(args.plan.parent);photo.base.private_json(args.plan,plan)
            print(json.dumps({'phase':'photo_plan_prepared',**plan['summary']})); return 0
        plan,digest = shared.read_private_json(args.plan)
        print(json.dumps(run_plan(plan,digest,args.state_dir,args.config,max_items=args.max_items,
                                 delay=args.delay,lock_dir=args.job_lock_dir))); return 0
    except Exception as error:
        reason = str(error) if isinstance(error,(shared.BackfillError,photo.RepairError)) else type(error).__name__
        print(json.dumps({'phase':'failed','reason':reason if re.fullmatch(r'[A-Za-z0-9_]{1,80}',reason) else 'failed'})); return 1


if __name__ == '__main__':
    def stop_cleanly(*_):raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop_cleanly)
    raise SystemExit(main())
