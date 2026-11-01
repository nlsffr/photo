"""Narrow, durable iPad controls for the four managed queue slots."""

import datetime as dt
import fcntl
import json
import math
import os
from pathlib import Path
import re
import stat
import tempfile
import time


CONFIG = Path('/etc/megabot-queue/config.json')
CURRENT = Path('/opt/megabot-queue/current')
STATE = Path('/var/lib/megabot-queue')
AVAILABLE_PHASES = frozenset(('waiting_legacy', 'running', 'waiting_work',
                              'storage_paused', 'network_paused', 'paused_storage', 'paused_database'))


class DashboardUnavailable(RuntimeError):
    def __init__(self):
        super().__init__('managed_queue_unavailable')


def _slot(bot_id):
    if not isinstance(bot_id, str) or not re.fullmatch(r'mega-[1-4]', bot_id):
        raise ValueError('invalid_bot')
    return int(bot_id[-1])


class Dashboard:
    def __init__(self, *, state_dir=STATE, proc=Path('/proc'), clock=time.time, max_age=30):
        self.root = Path(state_dir)
        self.proc = Path(proc)
        self.clock = clock
        self.max_age = max_age

    def _json(self, path):
        root = self.root.lstat()
        if not stat.S_ISDIR(root.st_mode) or root.st_uid != os.geteuid() or root.st_mode & 0o077:
            raise DashboardUnavailable()
        fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
        with os.fdopen(fd, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                    or info.st_mode & 0o077 or info.st_size > 65536):
                raise DashboardUnavailable()
            return json.load(stream)

    def _alive(self, pid, mode, owner=None):
        if type(pid) is not int or pid <= 1:
            return False
        try:
            path = self.proc / str(pid)
            fields = (path / 'stat').read_text().rsplit(')', 1)[1].split()
            if fields[0] == 'Z':
                return False
            args = [os.fsdecode(a) for a in (path / 'cmdline').read_bytes().split(b'\0') if a]
            index = next(i for i, arg in enumerate(args[1:], 1) if Path(arg).name == 'supervisor.py')
            if args[index + 1] != mode:
                return False
            config_index = args.index('--config')
            if Path(args[config_index + 1]) != CONFIG:
                return False
            return owner is None or args[args.index('--owner') + 1] == owner
        except (OSError, ValueError, StopIteration, IndexError):
            return False

    def snapshot(self):
        try:
            raw = self._json(self.root / 'status.json')
            if not isinstance(raw, dict) or raw.get('phase') not in AVAILABLE_PHASES:
                raise DashboardUnavailable()
            updated = raw.get('updated_at')
            if (type(updated) not in (int, float) or not math.isfinite(updated)
                    or not -5 <= self.clock() - updated <= self.max_age
                    or not self._alive(raw.get('supervisor_pid'), 'run')):
                raise DashboardUnavailable()
            rows = raw.get('slots')
            if not isinstance(rows, list) or len(rows) != 4:
                raise DashboardUnavailable()
            slots = {}
            for row in rows:
                if (not isinstance(row, dict) or type(row.get('slot')) is not int
                        or row['slot'] not in range(1, 5) or row['slot'] in slots
                        or row.get('state') not in ('running', 'paused', 'waiting')):
                    raise DashboardUnavailable()
                if row['state'] == 'running' and (
                        type(row.get('pid')) is not int or row['pid'] <= 1
                        or not isinstance(row.get('owner'), str) or not row['owner']):
                    raise DashboardUnavailable()
                slots[row['slot']] = {key: row.get(key) for key in ('slot', 'pid', 'owner', 'handle', 'state')}
            return {'phase': raw['phase'], 'updated_at': updated, 'slots': slots}
        except Exception:
            raise DashboardUnavailable() from None

    def disabled_slots(self):
        try:
            try:
                raw = self._json(self.root / 'control.json')
            except FileNotFoundError:
                return set()
            if (not isinstance(raw, dict) or set(raw) != {'disabled_slots'}
                    or not isinstance(raw['disabled_slots'], list)
                    or any(type(n) is not int or n not in range(1, 5) for n in raw['disabled_slots'])):
                raise DashboardUnavailable()
            return set(raw['disabled_slots'])
        except Exception:
            raise DashboardUnavailable() from None

    def set_enabled(self, bot_id, enabled):
        slot = _slot(bot_id)
        if type(enabled) is not bool:
            raise ValueError('invalid_enabled')
        self.snapshot()
        fd = os.open(self.root / 'control.lock', os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        temporary = None
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
                raise DashboardUnavailable()
            fcntl.flock(fd, fcntl.LOCK_EX)
            self.snapshot()
            disabled = self.disabled_slots()
            disabled.discard(slot) if enabled else disabled.add(slot)
            out_fd, temporary = tempfile.mkstemp(prefix='.control-', dir=self.root)
            with os.fdopen(out_fd, 'w') as out:
                os.fchmod(out.fileno(), 0o600)
                json.dump({'disabled_slots': sorted(disabled)}, out)
                out.write('\n')
                out.flush()
                os.fsync(out.fileno())
            os.replace(temporary, self.root / 'control.json')
            temporary = None
            directory = os.open(self.root, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        except Exception:
            raise DashboardUnavailable() from None
        finally:
            os.close(fd)
            if temporary is not None:
                os.unlink(temporary)

    def item(self, bot_id, name, legacy_item):
        slot = _slot(bot_id)
        snapshot = self.snapshot()
        enabled = slot not in self.disabled_slots()
        if snapshot['phase'] == 'waiting_legacy':
            legacy = legacy_item()
            if legacy['state'] == 'error' or legacy.get('pid'):
                return {**legacy, 'managedQueue': True, 'queuePhase': snapshot['phase'],
                        'actions': ['stop'] if enabled and legacy.get('pid') and legacy['state'] != 'error' else []}
        row = snapshot['slots'][slot]
        pid = row['pid'] if self._alive(row['pid'], '_worker', row['owner']) else None
        state = 'running' if pid else 'active' if enabled else 'stopped'
        handle = row['handle']
        if not isinstance(handle, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,200}', handle):
            handle = None
        return {'id': bot_id, 'name': name, 'kind': 'process', 'state': state,
                'activity': 'unknown', 'pid': pid, 'range': None, 'lastLogAt': None,
                'recent': {'success': None, 'errors': None, 'skipped': None}, 'progress': None,
                'actions': ['stop'] if enabled else [] if pid else ['start'],
                'managedQueue': True, 'queuePhase': snapshot['phase'], 'currentHandle': handle,
                'queueObservedAt': dt.datetime.fromtimestamp(snapshot['updated_at'], dt.timezone.utc).isoformat()}
