#!/usr/bin/env python3
"""Prepare immutable, private repair plans and run a bounded resumable backfill.

Publication belongs exclusively to the sibling Repair implementation. This driver
never changes media URLs, versions, source IDs or withdrawal decisions.
"""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import signal
import sqlite3
import stat
import sys
import tempfile
import time


VERSION = 1
NETWORK_BACKOFF = 60
MAX_SESSION_ITEMS = 100
RETRY_DISPATCH_QUOTA = 25
SKIP_CODES = frozenset('''excluded notice_excluded source_excluded source_unavailable
source_http_401 source_http_403 source_http_404 source_http_410 source_refused
candidate_changed registry_changed registry_key_changed invalid_video_key
invalid_poster_key poster_is_video invalid_asset_url invalid_asset_host
invalid_asset_path invalid_source_host source_redirect_limit download_too_large'''.split())


class BackfillError(RuntimeError):
    pass


def load_repair(path=None):
    path = Path(path) if path else Path(__file__).with_name('repair-missing-video-assets.py')
    spec = importlib.util.spec_from_file_location('_video_backfill_repair', path)
    if spec is None or spec.loader is None:
        raise BackfillError('repair_module_unavailable')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_private_json(path):
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                or info.st_mode & 0o077 or info.st_size > 256 * 1024**2):
            raise BackfillError('input_not_private')
        content = stream.read()
    try:
        return json.loads(content), hashlib.sha256(content).hexdigest()
    except ValueError:
        raise BackfillError('invalid_json') from None


def atomic_json(path, value):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, default=str); stream.write('\n')
            stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def append_event(path, outcome, now):
    event = {'at': now, 'job': hashlib.sha256(outcome['id'].encode()).hexdigest()[:16],
             'status': outcome['status']}
    if 'reason' in outcome:
        event['reason'] = outcome['reason']
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise BackfillError('journal_not_private')
        data = (json.dumps(event)+'\n').encode()
        while data:
            written = os.write(fd, data); data = data[written:]
        os.fsync(fd)
    finally:
        os.close(fd)


def candidate_ids(inventory):
    if (not isinstance(inventory, dict) or inventory.get('complete') is not True
            or type(inventory.get('active_videos')) is not int
            or inventory['active_videos'] < 0):
        raise BackfillError('incomplete_inventory')
    result = set()
    for field in ('missing_rows', 'thumbnail_missing_rows'):
        rows = inventory.get(field)
        if not isinstance(rows, list):
            raise BackfillError('inventory_rows_invalid')
        for row in rows:
            if (not isinstance(row, dict) or not isinstance(row.get('id'), str)
                    or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', row['id'])):
                raise BackfillError('inventory_id_invalid')
            result.add(row['id'])
    return sorted(result)


def source_id_for(row, repair):
    if row.get('photo_source_id') is not None and str(row['photo_source_id']).strip():
        value = str(row['photo_source_id'])
    else:
        value = Path(repair.object_key(row['video_url'])).stem
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
        raise BackfillError('source_id_unusable')
    return value


def prepare_plan(inventory, db, repair, inventory_digest, *, now=None):
    ids = candidate_ids(inventory)
    rows, review = [], []
    for offset in range(0, len(ids), 100):
        subset = ids[offset:offset + 100]
        cur = db.cursor(dictionary=True)
        try:
            cur.execute('SET SESSION max_statement_time=15')
            db.start_transaction(readonly=True)
            cur.execute('''SELECT p.id,p.source_id photo_source_id,p.file_size,p.url_version,
                p.video_url,p.image_url,p.preview_url,p.is_hidden,p.removed_from_index_at,
                c.id creator_id,c.handle,c.is_hidden creator_hidden,c.removed_from_index_at creator_removed
                FROM photos p JOIN creators c ON c.id=p.creator_id
                WHERE p.id IN (''' + ','.join(['%s'] * len(subset)) + ''')
                AND p.type='video' AND p.is_hidden=0 AND p.removed_from_index_at IS NULL
                AND c.is_hidden=0 AND c.removed_from_index_at IS NULL''', subset)
            actual = {row['id']: row for row in cur.fetchall()}
            candidates = []
            for photo_id in subset:
                row = actual.get(photo_id)
                if row is None:
                    review.append({'id': photo_id, 'reason': 'inactive_or_missing'}); continue
                if not row.get('video_url'):
                    review.append({'id': photo_id, 'reason': 'video_url_empty'}); continue
                try:
                    sid = source_id_for(row, repair)
                except Exception:
                    review.append({'id': photo_id, 'reason': 'source_id_unusable'}); continue
                candidates.append((row, sid))
            source_ids = list(dict.fromkeys(sid for row, sid in candidates))
            registry = {}
            if source_ids:
                cur.execute('SELECT source_id,photo_id,minio_key FROM bot_ingested WHERE source_id IN ('
                            + ','.join(['%s'] * len(source_ids)) + ')', source_ids)
                registry = {str(row['source_id']): row for row in cur.fetchall()}
            for row, sid in candidates:
                entry = registry.get(sid)
                if entry is None or entry['photo_id'] != row['id']:
                    review.append({'id': row['id'], 'reason': 'registry_unresolved'}); continue
                expected = {**row, 'source_id': entry['source_id'], 'minio_key': entry['minio_key']}
                try:
                    repair.validate_candidate(expected, expected)
                except Exception as error:
                    reason = str(error) if isinstance(error, repair.RepairError) else 'candidate_invalid'
                    reason = reason if re.fullmatch(r'[a-z0-9_]{1,80}', reason) else 'candidate_invalid'
                    review.append({'id': row['id'], 'reason': reason}); continue
                rows.append(expected)
        finally:
            db.rollback(); cur.close()
    return {'version': VERSION, 'created_at': time.time() if now is None else now,
            'inventory_sha256': inventory_digest,
            'summary': {'requested_ids': len(ids), 'planned_rows': len(rows), 'review_rows': len(review),
                        'review_reasons': dict(Counter(item['reason'] for item in review))},
            'rows': rows, 'review': review}


def validate_plan(plan):
    if not isinstance(plan, dict) or plan.get('version') != VERSION or not isinstance(plan.get('rows'), list):
        raise BackfillError('plan_invalid')
    ids = set()
    for row in plan['rows']:
        if (not isinstance(row, dict) or not isinstance(row.get('id'), str)
                or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', row['id']) or row['id'] in ids):
            raise BackfillError('plan_duplicate_or_invalid_id')
        ids.add(row['id'])
    return plan['rows']


@contextmanager
def file_lock(path):
    fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
            raise BackfillError('lock_not_private')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise BackfillError('already_running') from None
        yield
    finally:
        os.close(fd)


def private_directory(path):
    path = Path(path); path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise BackfillError('state_not_private')
    return path


class State:
    def __init__(self, root, rows, digest):
        self.root = private_directory(root)
        path = self.root/'checkpoint.sqlite3'
        self.db = sqlite3.connect(path, timeout=15, isolation_level=None)
        os.chmod(path, 0o600)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL'); self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TEMP TABLE repair_priority (id TEXT PRIMARY KEY)')
        self.db.execute('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)')
        self.db.execute('''CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,expected TEXT NOT NULL,position INTEGER UNIQUE NOT NULL,
            state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
            available_at REAL NOT NULL DEFAULT 0,result TEXT)''')
        before = self.get_meta('plan_sha256')
        if before is not None and before != digest:
            self.db.close()
            raise BackfillError('plan_changed')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            self.set_meta('plan_sha256', digest)
            for index, row in enumerate(rows):
                self.db.execute('INSERT OR IGNORE INTO jobs(id,expected,position) VALUES(?,?,?)',
                                (row['id'], json.dumps(row, sort_keys=True), index))
            # The exclusive driver lock proves the previous publisher process exited.
            self.db.execute("UPDATE jobs SET state='pending' WHERE state='running'")
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK'); raise

    def get_meta(self, key, default=None):
        row = self.db.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
        return row[0] if row else default

    def set_meta(self, key, value):
        self.db.execute('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', (key, str(value)))

    def prioritize(self, ids):
        self.db.execute('DELETE FROM repair_priority')
        self.db.executemany('INSERT OR IGNORE INTO repair_priority(id) VALUES(?)', [(value,) for value in ids])

    def next_job(self, now):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            raw_debt = self.get_meta('retry_dispatch_debt', '0')
            if (not isinstance(raw_debt, str) or not re.fullmatch(r'0|[1-9][0-9]?', raw_debt)
                    or int(raw_debt) > RETRY_DISPATCH_QUOTA):
                raise BackfillError('retry_dispatch_debt_invalid')
            debt = int(raw_debt)
            row = None
            reserved_retry = False
            if debt >= RETRY_DISPATCH_QUOTA:
                # Rotate retries by their deadline, not original position: a
                # repeatedly failing old job must not monopolize every slot.
                row = self.db.execute("SELECT * FROM jobs WHERE state='retry' AND available_at<=? ORDER BY available_at,position LIMIT 1", (now,)).fetchone()
                reserved_retry = row is not None
            if row is None:
                row = self.db.execute("SELECT j.* FROM jobs j LEFT JOIN repair_priority p ON p.id=j.id WHERE j.state IN ('pending','retry') AND j.available_at<=? ORDER BY CASE WHEN p.id IS NULL THEN 1 ELSE 0 END,CASE j.state WHEN 'pending' THEN 0 ELSE 1 END,j.position LIMIT 1", (now,)).fetchone()
            if row:
                claimed = self.db.execute("UPDATE jobs SET state='running',attempts=attempts+1 WHERE id=? AND state=? AND available_at<=?", (row['id'], row['state'], now))
                if claimed.rowcount != 1:
                    raise BackfillError('job_claim_changed')
                # Normal-priority retries count too; only a reserved slot pays
                # the debt, which persists across bounded service sessions.
                self.set_meta('retry_dispatch_debt', 0 if reserved_retry else min(RETRY_DISPATCH_QUOTA, debt + 1))
            self.db.execute('COMMIT')
            return row
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def finish(self, photo_id, state, result, available_at, not_before):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            self.db.execute('UPDATE jobs SET state=?,result=?,available_at=? WHERE id=?',
                            (state, json.dumps(result), available_at, photo_id))
            self.set_meta('global_not_before', not_before)
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK'); raise

    def summary(self):
        counts = {'pending': 0, 'running': 0, 'done': 0, 'skipped': 0, 'retry': 0}
        counts.update(dict(self.db.execute('SELECT state,COUNT(*) FROM jobs GROUP BY state')))
        return {'total': sum(counts.values()), **counts}

    def close(self):
        self.db.close()


def safe_reason(error, repair):
    if isinstance(error, repair.RepairError):
        reason = str(error)
        return reason if re.fullmatch(r'[a-z0-9_]{1,80}', reason) else 'runtime_failure'
    # Dependencies are loaded by the runtime, not required for plan preparation.
    # Inspect known exception hierarchies only; messages, URLs and SQL stay private.
    hierarchy = {(base.__module__, base.__name__) for base in type(error).__mro__}
    if (isinstance(error, json.JSONDecodeError)
            or ('requests.exceptions', 'JSONDecodeError') in hierarchy):
        return 'json_decode_error'
    if ('requests.exceptions', 'Timeout') in hierarchy:
        return 'request_timeout'
    if ('requests.exceptions', 'ConnectionError') in hierarchy:
        return 'request_connection_error'
    if ('requests.exceptions', 'RequestException') in hierarchy:
        return 'request_error'
    if ('mysql.connector.errors', 'Error') in hierarchy:
        errno = getattr(error, 'errno', None)
        return ('database_mysql_' + str(errno)
                if type(errno) is int and 1 <= errno <= 65535 else 'database_mysql_error')
    if isinstance(error, TimeoutError):
        return 'runtime_timeout'
    return 'runtime_failure'


def run_plan(plan, plan_digest, state_dir, repair, config, *, max_items=1, delay=1,
             lock_dir=None, clock=time.time, sleep=time.sleep, runtime_factory=None):
    if type(max_items) is not int or not 1 <= max_items <= MAX_SESSION_ITEMS or not math.isfinite(delay) or delay < 1:
        raise BackfillError('run_limits_invalid')
    rows = validate_plan(plan)
    root = private_directory(state_dir)
    locks = private_directory(lock_dir or root/'job-locks')
    runtime, state = None, None
    counters = Counter(); attempted = 0
    with file_lock(root/'driver.lock'):
        try:
            state = State(root, rows, plan_digest)
            pause_until = float(state.get_meta('global_not_before', '0'))
            if clock() < pause_until:
                result = {'phase': 'paused', 'not_before': pause_until, 'attempted': 0,
                          'session': {}, 'jobs': state.summary()}
                atomic_json(root/'progress.json', result); return result
            while attempted < max_items:
                pause_until = float(state.get_meta('global_not_before', '0'))
                wait = pause_until - clock()
                if wait > 0:
                    sleep(wait)
                job = state.next_job(clock())
                if job is None:
                    break
                expected = json.loads(job['expected'])
                attempted += 1
                atomic_json(root/'progress.json', {'phase': 'running', 'attempted': attempted,
                            'session': dict(counters), 'jobs': state.summary()})
                try:
                    with file_lock(locks/(hashlib.sha256(job['id'].encode()).hexdigest()+'.lock')):
                        if runtime is None:
                            factory = runtime_factory or repair.Repair
                            runtime = factory(config, root/'repair.jsonl')
                        outcome = runtime.run(expected, apply=True)
                    if not isinstance(outcome, dict) or outcome.get('status') not in ('restored', 'already_present'):
                        raise BackfillError('unexpected_repair_result')
                    public = {'id': job['id'], 'status': outcome['status']}
                    state.finish(job['id'], 'done', public, 0, clock()+delay); counters[outcome['status']] += 1
                except Exception as error:
                    reason = safe_reason(error, repair)
                    skipped = reason in SKIP_CODES
                    public = {'id': job['id'], 'status': 'skipped' if skipped else 'retry', 'reason': reason}
                    state.finish(job['id'], 'skipped' if skipped else 'retry', public,
                                 0 if skipped else clock()+NETWORK_BACKOFF,
                                 clock()+delay if skipped else clock()+NETWORK_BACKOFF)
                    counters[public['status']] += 1
                    if not skipped:
                        append_event(root/'events.jsonl', public, clock())
                        result = {'phase': 'paused_network', 'not_before': clock()+NETWORK_BACKOFF,
                                  'attempted': attempted, 'session': dict(counters), 'jobs': state.summary()}
                        atomic_json(root/'progress.json', result); return result
                append_event(root/'events.jsonl', public, clock())
                atomic_json(root/'progress.json', {'phase': 'running', 'attempted': attempted,
                            'session': dict(counters), 'jobs': state.summary()})
            result = {'phase': 'session_complete', 'attempted': attempted, 'session': dict(counters), 'jobs': state.summary()}
            atomic_json(root/'progress.json', result); return result
        finally:
            if runtime is not None:
                try:
                    runtime.close()
                except Exception:
                    pass
            if state is not None:
                state.close()


def connect_readonly(config):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from ops.megabot_queue.supervisor import read_config
    import mysql.connector
    values = read_config(config)['env']
    return mysql.connector.connect(host=values['MEGABOT_DB_HOST'],
        port=int(values.get('MEGABOT_DB_PORT','3306')), user=values['MEGABOT_DB_USER'],
        password=values['MEGABOT_DB_PASSWORD'], database=values['MEGABOT_DB_NAME'], connection_timeout=5)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--prepare-plan', action='store_true'); mode.add_argument('--run', action='store_true')
    parser.add_argument('--inventory', type=Path); parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--config', default='/etc/megabot-queue/config.json')
    parser.add_argument('--state-dir', type=Path, default=Path('/var/lib/video-repair/backfill'))
    parser.add_argument('--job-lock-dir', type=Path, default=Path('/var/lib/video-repair/job-locks'))
    parser.add_argument('--max-items', type=int, default=1); parser.add_argument('--delay', type=float, default=1)
    args = parser.parse_args(argv)
    try:
        repair = load_repair()
        if args.prepare_plan:
            if args.inventory is None:
                parser.error('--inventory is required with --prepare-plan')
            inventory, digest = read_private_json(args.inventory)
            candidate_ids(inventory)
            db = connect_readonly(args.config)
            try:
                plan = prepare_plan(inventory, db, repair, digest)
            finally:
                db.close()
            private_directory(args.plan.parent)
            repair.private_json(args.plan, plan)
            print(json.dumps({'phase':'plan_prepared', **plan['summary']})); return 0
        plan, digest = read_private_json(args.plan)
        print(json.dumps(run_plan(plan,digest,args.state_dir,repair,args.config,max_items=args.max_items,
                                  delay=args.delay,lock_dir=args.job_lock_dir)))
        return 0
    except Exception as error:
        # Never echo external exception messages, connection strings or source URLs.
        reason = str(error) if isinstance(error, BackfillError) else type(error).__name__
        print(json.dumps({'phase':'failed','reason':reason if re.fullmatch(r'[A-Za-z0-9_]{1,80}',reason) else 'failed'})); return 1


if __name__ == '__main__':
    def stop_cleanly(*_):
        # Unwind the download's TemporaryDirectory and locks before a restart.
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop_cleanly)
    raise SystemExit(main())
