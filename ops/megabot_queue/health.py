"""Bounded, read-only pipeline observations. No source, storage or photos DB calls."""
import datetime as dt
import json
import math
import os
from pathlib import Path
import sqlite3
import stat
import threading
import time
from urllib.parse import urlsplit

MAX_JOURNAL_BYTES = 32 * 1024 * 1024
JOURNAL_CHUNK = 8 * 1024 * 1024
ROOTS = {'video': Path('/var/lib/video-repair/backfill'), 'photo': Path('/var/lib/photo-repair/backfill')}
COUNTERS = ('restoredRows', 'alreadyPresent', 'pending', 'running', 'retry', 'excluded')


def iso(value):
    try:
        if type(value) not in (int, float) or not math.isfinite(value): return None
        return dt.datetime.fromtimestamp(value, dt.timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, OverflowError, OSError): return None


def private_stat(path, limit):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077 or info.st_size > limit:
        raise ValueError('private_file_unavailable')
    return info


def read_json(path, limit=65536):
    private_stat(path, limit)
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077: raise ValueError()
        raw = stream.read(limit + 1)
    if len(raw) > limit: raise ValueError()
    return json.loads(raw), info.st_mtime


def empty_repair(kind):
    row = {'state': 'unavailable', **dict.fromkeys(COUNTERS), 'lastRestoredAt': None,
           'observedAt': None, 'progressObservedAt': None, 'phase': None, 'pauseUntil': None,
           'stale': True, 'errors': ['repair_snapshot_unavailable']}
    if kind == 'video': row.update(videoFilesRestored=None, posterOnlyRestored=None)
    return row


class RepairReader:
    def __init__(self, root, kind, clock):
        self.root, self.kind, self.clock = Path(root), kind, clock
        self.checked = float('-inf'); self.last = None; self.result = None; self.journals = {}

    def journal(self, name, wanted=()):
        path = self.root / name; info = private_stat(path, MAX_JOURNAL_BYTES)
        identity = (info.st_dev, info.st_ino)
        row = self.journals.get(name)
        if row is None or row['identity'] != identity or info.st_size < row['offset']:
            row = {'identity': identity, 'offset': 0, 'ids': {s: set() for s in wanted}, 'last': None}
            self.journals[name] = row
        fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        try:
            actual = os.fstat(fd)
            if (actual.st_dev, actual.st_ino) != identity: raise ValueError()
            raw = os.pread(fd, min(JOURNAL_CHUNK, info.st_size - row['offset']), row['offset'])
        finally: os.close(fd)
        for line in raw.splitlines(keepends=True):
            if not line.endswith(b'\n'):
                if len(line) > 65536: raise ValueError()
                break
            if len(line) > 65536: raise ValueError()
            item = json.loads(line)
            if not isinstance(item, dict): raise ValueError()
            status, identifier = item.get('status'), item.get('id')
            if not isinstance(status, str): raise ValueError()
            if status in row['ids']:
                if not isinstance(identifier, str) or not identifier or len(identifier) > 128: raise ValueError()
                row['ids'][status].add(identifier)
            stamp = item.get('at')
            if status == 'restored':
                if iso(stamp) is None or stamp < 0 or stamp > self.clock() + 5: raise ValueError()
                row['last'] = max(row['last'] or 0, stamp)
            row['offset'] += len(line)
            if sum(len(ids) for ids in row['ids'].values()) > 250000: raise ValueError()
        if row['offset'] != info.st_size: raise ValueError('journal_index_incomplete')
        return row

    def snapshot(self):
        if self.clock() - self.checked < 10 and self.result is not None: return dict(self.result)
        self.checked = self.clock()
        row = empty_repair(self.kind)
        try:
            path = self.root / 'checkpoint.sqlite3'; private_stat(path, 256 * 1024 * 1024)
            db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=.1)
            deadline = time.monotonic() + .5
            db.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
            try:
                db.execute('PRAGMA query_only=ON')
                db.execute('BEGIN')
                groups = db.execute("SELECT state,json_extract(result,'$.status'),COUNT(*) FROM jobs GROUP BY state,json_extract(result,'$.status')").fetchall()
                restored = {x[0] for x in db.execute("SELECT id FROM jobs WHERE state='done' AND json_extract(result,'$.status')='restored'")}
                if any(not isinstance(identifier, str) or not identifier or len(identifier) > 128 for identifier in restored): raise ValueError()
            finally: db.close()
            counts = dict.fromkeys(COUNTERS, 0)
            for state, status, count in groups:
                if state not in ('pending', 'running', 'retry', 'skipped', 'done'): raise ValueError()
                if state == 'done':
                    if status not in ('restored', 'already_present'): raise ValueError()
                    counts['restoredRows' if status == 'restored' else 'alreadyPresent'] += count
                else: counts['excluded' if state == 'skipped' else state] += count
            row.update(counts, state='available', stale=False, errors=[], observedAt=iso(self.clock()))
        except (OSError, ValueError, sqlite3.Error):
            if self.last is not None:
                row = {**self.last, 'state': 'stale', 'stale': True, 'errors': ['repair_snapshot_unavailable']}
            self.result = row
            return dict(row)
        try:
            progress, stamp = read_json(self.root / 'progress.json')
            phases = ('paused', 'paused_network', 'running', 'session_complete', 'complete', 'failed')
            if not isinstance(progress, dict) or progress.get('phase') not in phases: raise ValueError()
            row.update(progressObservedAt=iso(stamp),
                       pauseUntil=iso(progress.get('not_before')) if progress.get('not_before') else None)
            if not -5 <= self.clock() - stamp <= 90:
                row['pauseUntil'] = None
                row['errors'].append('repair_progress_stale')
            else: row['phase'] = progress['phase']
        except (OSError, ValueError, TypeError): row['errors'].append('repair_progress_unavailable')
        try: row['lastRestoredAt'] = iso(self.journal('events.jsonl')['last'])
        except (OSError, ValueError, TypeError): row['errors'].append('repair_events_unavailable')
        if self.kind == 'video':
            try:
                ids = self.journal('repair.jsonl', ('video_uploaded', 'poster_uploaded'))['ids']
                row['videoFilesRestored'] = len(restored & ids['video_uploaded'])
                row['posterOnlyRestored'] = len((restored - ids['video_uploaded']) & ids['poster_uploaded'])
            except (OSError, ValueError, TypeError): row['errors'].append('repair_details_unavailable')
        self.last = self.result = row
        return dict(row)


def quality_snapshot(path, clock):
    counts = {'expected':3, 'passed':0, 'failed':0, 'retired':0, 'unknown':3}
    result = {'state':'unavailable', 'status':'unknown', 'observedAt':None,
              'stale':True, 'counts':counts, 'issues':['media_quality_unavailable']}
    try:
        value, _ = read_json(path)
        if not isinstance(value, dict) or value.get('version') != 1:
            raise ValueError()
        incoming = value.get('counts')
        if (not isinstance(incoming, dict) or set(incoming) != set(counts)
                or any(type(number) is not int or not 0 <= number <= 3 for number in incoming.values())
                or incoming['expected'] != 3 or sum(incoming[key] for key in ('passed','failed','retired','unknown')) != 3):
            raise ValueError()
        expected_status = 'degraded' if incoming['failed'] else 'healthy' if incoming['passed'] == 3 else 'unknown'
        if value.get('status') != expected_status:
            raise ValueError()
        stamp = value.get('observedAt')
        if not isinstance(stamp, str) or len(stamp) > 64:
            raise ValueError()
        parsed = dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))
        if parsed.tzinfo is None:
            raise ValueError()
        age = clock() - parsed.timestamp()
        result['observedAt'] = iso(parsed.timestamp())
        if not -5 <= age < 1800:
            return {**result, 'state':'stale', 'issues':['media_quality_snapshot_stale']}
        return {**result, 'state':'available', 'status':expected_status, 'stale':False,
                'counts':dict(incoming), 'issues':(['media_quality_failed'] if expected_status == 'degraded'
                    else ['media_quality_incomplete'] if expected_status == 'unknown' else [])}
    except (OSError, ValueError, TypeError, OverflowError):
        return result


class PipelineHealth:
    def __init__(self, *, queue_reader, repair_roots=ROOTS, queue_config=Path('/etc/megabot-queue/config.json'), proc=Path('/proc'), clock=time.time, quality_path=Path('/var/lib/maison-media-quality/latest.json')):
        self.queue_reader, self.queue_config, self.proc, self.clock = queue_reader, Path(queue_config), Path(proc), clock
        self.quality_path = Path(quality_path)
        self.repairs = {kind: RepairReader(repair_roots[kind], kind, clock) for kind in ('video', 'photo')}
        self.lock = threading.Lock()

    def proxy_available(self):
        cfg, _ = read_json(self.queue_config)
        value = cfg.get('env', {}).get('MEGABOT_PROXIES')
        if not isinstance(value, str) or not value or len(value) > 4096: raise ValueError()
        proxies = [urlsplit(x.strip()) for x in value.split(',')]
        if len(proxies) > 8 or any(p.scheme not in ('socks5', 'socks5h') or p.hostname != '127.0.0.1' or not p.port for p in proxies): raise ValueError()
        with (self.proc / 'net/tcp').open('rb') as stream: raw = stream.read(512 * 1024 + 1)
        if len(raw) > 512 * 1024: raise ValueError()
        listeners = {parts[1].decode() for line in raw.splitlines()[1:] if len(parts := line.split()) > 3 and parts[3] == b'0A'}
        return all('0100007F:' + format(p.port, '04X') in listeners for p in proxies)

    def snapshot(self):
        with self.lock:
            queue = {'phase': None, 'enabledSlots': None, 'activeWorkers': None, 'proxyAvailable': None,
                     'proxyScope': 'loopback_listener', 'pauseKind': None, 'pauseUntil': None,
                     'observedAt': None, 'stale': True, 'errors': []}
            try:
                tool = self.queue_reader()
                if tool is None: raise ValueError()
                status = tool.health_snapshot()
                queue.update(phase=status['phase'], observedAt=iso(status['updated_at']), stale=False,
                             activeWorkers=sum(tool._alive(row['pid'], '_worker', row['owner']) for row in status['slots'].values()),
                             pauseKind=status.get('pause_kind'), pauseUntil=iso(status.get('pause_until')) if status.get('pause_until') else None)
                try: queue['enabledSlots'] = 4 - len(tool.disabled_slots())
                except Exception: queue['errors'].append('queue_controls_unavailable')
            except Exception: queue['errors'].append('queue_unavailable')
            try: queue['proxyAvailable'] = self.proxy_available()
            except (OSError, ValueError, TypeError, AttributeError): queue['errors'].append('proxy_observation_unavailable')
            repairs = {kind: reader.snapshot() for kind, reader in self.repairs.items()}
            errors = list(queue['errors'])
            for kind, row in repairs.items(): errors.extend(kind + '_' + code for code in row['errors'])
            return {'version': 1, 'observedAt': iso(self.clock()), 'stale': queue['stale'] or any(row['stale'] for row in repairs.values()),
                    'errors': errors, 'queue': queue, 'repairs': repairs, 'quality': quality_snapshot(self.quality_path, self.clock)}
