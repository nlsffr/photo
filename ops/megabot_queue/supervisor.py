"""Four profile workers, with a legacy-generation barrier and kernel-owned locks.

Run as a service with KillMode=control-group. Only this supervisor claims jobs.
Children inherit the pool lock, so a parent crash cannot permit a second pool
while an earlier child is alive. Logs contain codes and counts, never exceptions
or configuration values. Source logs are also discarded at the process boundary.
"""

import argparse
from contextlib import contextmanager, redirect_stderr, redirect_stdout
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import sqlite3
import stat
import subprocess
import sys
import tempfile
import threading
import time
import types
import uuid

# Direct-script execution must not shadow the standard-library queue module with
# our sibling queue.py when requests/urllib3 imports its own queue dependency.
if __package__ in (None, ''):
    package = Path(__file__).resolve().parent
    sys.path = [p for p in sys.path if Path(p or os.getcwd()).resolve() != package]
    sys.path.insert(0, str(package.parent.parent))

from ops.megabot_queue.queue import Queue


ENV_KEYS = frozenset('''MEGABOT_BASE_URL MEGABOT_CDN_BASE BOT_ID START_INDEX END_INDEX
MEGABOT_DELAY_MIN MEGABOT_DELAY_MAX MEGABOT_DETAILS_DELAY MEGABOT_DOWNLOAD_DIR
MEGABOT_DB_HOST MEGABOT_DB_PORT MEGABOT_DB_USER MEGABOT_DB_PASSWORD MEGABOT_DB_NAME
DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME MEGABOT_PROXIES S3_ENDPOINT S3_REGION
S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY'''.split())
PHASES = frozenset(('starting', 'waiting_legacy', 'waiting_workers', 'running',
                   'waiting_work', 'storage_paused', 'network_paused', 'paused_database',
                   'source_changed', 'stopping', 'stopped', 'unknown'))
RESULTS = frozenset(('done', 'continue', 'retry', 'excluded', 'storage_full', 'source_changed'))
REASONS = frozenset('''source_unavailable request_or_json_failed invalid_details
invalid_profile_page ambiguous_profile_page unexpected_profile database_transaction_lost
pagination_limit invalid_media_id media_processing_failed profile_execution_failed
profile_excluded profile_changed storage_limit_reached source_changed unexpected_error
retryable_error missing_result process_exit media_lock_busy'''.split())
NETWORK_FAILURES = frozenset(('request_or_json_failed', 'http_429', 'http_500',
                              'http_502', 'http_503', 'http_504'))


def safe_reason(value):
    if isinstance(value, str) and (value in REASONS or re.fullmatch(r'http_[1-5][0-9]{2}', value)):
        return value
    return None


class ConfigurationError(RuntimeError):
    pass


class SourceChanged(RuntimeError):
    pass


def read_config(path):
    path = Path(path)
    if not stat.S_ISREG(path.stat().st_mode) or path.stat().st_mode & 0o077:
        raise ConfigurationError('config_permissions')
    config = json.loads(path.read_text())
    if not isinstance(config, dict) or set(config) != {'source_path', 'expected_sha256', 'state_dir', 'env'}:
        raise ConfigurationError('config_fields')
    for field in ('source_path', 'state_dir'):
        if not isinstance(config[field], str) or not Path(config[field]).is_absolute():
            raise ConfigurationError('config_path')
    digest = config['expected_sha256']
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
        raise ConfigurationError('config_hash')
    env = config['env']
    if not isinstance(env, dict) or not set(env).issubset(ENV_KEYS):
        raise ConfigurationError('config_environment_keys')
    if any(not isinstance(value, str) or '\0' in value for value in env.values()):
        raise ConfigurationError('config_environment_values')
    required = ('MEGABOT_DB_HOST', 'MEGABOT_DB_USER', 'MEGABOT_DB_NAME',
                'S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY')
    if any(not env.get(key) for key in required) or not (env.get('MEGABOT_DB_PASSWORD') or env.get('DB_PASSWORD')):
        raise ConfigurationError('config_environment_missing')
    return config


def verified_source(config):
    content = Path(config['source_path']).read_bytes()
    if hashlib.sha256(content).hexdigest() != config['expected_sha256']:
        raise SourceChanged('source_changed')
    return content


def legacy_processes(proc_root=Path('/proc'), legacy_cwd=Path('/opt/megabot')):
    result = []
    for path in Path(proc_root).glob('[0-9]*'):
        try:
            args = (path / 'cmdline').read_bytes().split(b'\0')
            if not any(Path(os.fsdecode(arg)).name == 'megabot.py' for arg in args[1:] if arg):
                continue
            if (path / 'cwd').resolve(strict=True) == Path(legacy_cwd).resolve():
                result.append(int(path.name))
        except (FileNotFoundError, ProcessLookupError):
            continue
        # Permission errors are not treated as proof that the process is absent.
    return sorted(result)


def try_lock(path):
    fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return None
    except BaseException:
        os.close(fd)
        raise
    return fd


def atomic_json(path, value):
    path = Path(path)
    fd, name = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(value, out, ensure_ascii=True)
            out.write('\n')
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def event(code, **counts):
    print(json.dumps({'event': code, **counts}), flush=True)


def read_control(state_dir):
    try:
        value = json.loads((Path(state_dir) / 'control.json').read_text())
    except FileNotFoundError:
        return set()
    except ValueError:
        return {1, 2, 3, 4}
    if (not isinstance(value, dict) or set(value) != {'disabled_slots'}
            or not isinstance(value['disabled_slots'], list)
            or any(type(slot) is not int or slot not in range(1, 5) for slot in value['disabled_slots'])):
        return {1, 2, 3, 4}
    return set(value['disabled_slots'])


def safe_handle(value):
    return value if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,200}', value) else None


def phase(state_dir, name, queue=None, workers=None, legacy=(), pause_until=0, pause_kind=None):
    workers = workers or {}
    disabled = read_control(state_dir)
    payload = {'phase': name, 'updated_at': int(time.time()), 'legacy_count': len(legacy),
               'worker_count': len(workers), 'pause_until': pause_until,
               'pause_kind': pause_kind if pause_kind in ('network', 'storage') else None,
               'supervisor_pid': os.getpid()}
    slots = []
    for slot in range(1, 5):
        worker = workers.get(slot)
        slots.append({'slot': slot, 'pid': worker['process'].pid if worker else None,
                      'owner': worker['owner'] if worker else None,
                      'handle': safe_handle(worker['handle']) if worker else None,
                      'state': 'running' if worker else 'paused' if slot in disabled or name in ('storage_paused', 'network_paused') else 'waiting'})
    payload['slots'] = slots
    if queue is not None:
        payload['queue'] = queue.stats()
    atomic_json(Path(state_dir) / 'status.json', payload)


def status(state_dir):
    """Read-only status; do not instantiate Queue or create the state directory."""
    root = Path(state_dir)
    try:
        raw = json.loads((root / 'status.json').read_text())
    except (FileNotFoundError, ValueError):
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    result = {'phase': raw.get('phase') if raw.get('phase') in PHASES else 'unknown'}
    result['pause_kind'] = raw.get('pause_kind') if raw.get('pause_kind') in ('network', 'storage') else None
    for key in ('updated_at', 'legacy_count', 'worker_count', 'pause_until', 'supervisor_pid'):
        if isinstance(raw.get(key), (int, float)):
            result[key] = raw[key]
    slots = []
    for slot in raw.get('slots', []) if isinstance(raw.get('slots'), list) else []:
        if not isinstance(slot, dict) or slot.get('slot') not in range(1, 5):
            continue
        owner = slot.get('owner')
        slots.append({'slot': slot['slot'], 'pid': slot.get('pid') if type(slot.get('pid')) is int else None,
                      'owner': owner if isinstance(owner, str) and re.fullmatch(r'[0-9a-f-]{36}', owner) else None,
                      'handle': safe_handle(slot.get('handle')),
                      'state': slot.get('state') if slot.get('state') in ('running', 'paused', 'waiting') else 'waiting'})
    result['slots'] = slots
    db_path = root / 'queue.sqlite3'
    if db_path.exists():
        db = sqlite3.connect(db_path.resolve().as_uri() + '?mode=ro', uri=True)
        try:
            counts = {'pending': 0, 'active': 0, 'done': 0}
            counts.update(dict(db.execute('SELECT state, COUNT(*) FROM jobs GROUP BY state')))
            result['queue'] = {'total': sum(counts.values()), **counts}
        finally:
            db.close()
    return result


def load_catalogue(config):
    import mysql.connector
    env = config['env']
    db = mysql.connector.connect(host=env['MEGABOT_DB_HOST'],
        port=int(env.get('MEGABOT_DB_PORT', '3306')), user=env['MEGABOT_DB_USER'],
        password=env.get('MEGABOT_DB_PASSWORD') or env['DB_PASSWORD'],
        database=env['MEGABOT_DB_NAME'], connection_timeout=5)
    try:
        cur = db.cursor()
        try:
            cur.execute('SET SESSION max_statement_time=8')
            db.start_transaction(readonly=True)
            cur.execute('SELECT handle FROM creators WHERE is_hidden=0 AND removed_from_index_at IS NULL ORDER BY handle')
            return [row[0] for row in cur.fetchall()]
        finally:
            cur.close()
            db.rollback()
    finally:
        db.close()


@contextmanager
def source_environment(env):
    before = {key: os.environ.get(key) for key in ENV_KEYS}
    try:
        for key in ENV_KEYS:
            os.environ.pop(key, None)
        os.environ.update(env)
        yield
    finally:
        for key, value in before.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def check(config):
    content = verified_source(config)
    module = types.ModuleType('_megabot_queue_source_check')
    module.__file__ = config['source_path']
    # A source import defines classes only; do not instantiate its worker or store.
    with source_environment(config['env']), open(os.devnull, 'w') as sink:
        with redirect_stdout(sink), redirect_stderr(sink):
            exec(compile(content, config['source_path'], 'exec'), module.__dict__)
            if not all(hasattr(module, name) for name in ('Config', 'MegaBot', 'MariaDB')):
                raise ConfigurationError('source_api')
            eligible, legacy = len(load_catalogue(config)), len(legacy_processes())
    return {'ok': True, 'source_hash_verified': True, 'source_imported': True,
            'eligible_handles': eligible, 'legacy_count': legacy}


def result_path(config, owner):
    # Owners are UUIDs generated here; no media identifier or URL enters a path.
    if str(uuid.UUID(owner)) != owner:
        raise ValueError('invalid_owner')
    return Path(config['state_dir']) / 'results' / (owner + '.json')


def run_child(config, owner, handle, slot, guard_fd):
    os.fstat(guard_fd)  # The inherited descriptor must stay open until exit.
    queue = Queue(Path(config['state_dir']) / 'queue.sqlite3')
    job = queue.owned_job(handle, owner)
    try:
        verified_source(config)
        from ops.megabot_queue.adapter import run_profile, RetryableError, StorageFull, Excluded
        try:
            with source_environment({**config['env'], 'BOT_ID': str(slot)}):
                output = run_profile(job['handle'], job['next_page'], job['empty_streak'],
                    lambda page, streak: queue.checkpoint(handle, owner, page, streak),
                    source_path=config['source_path'],
                    download_dir=Path(config['state_dir']) / 'downloads' / owner,
                    lock_dir=Path(config['state_dir']) / 'media-locks')
            result = {'status': output['status']}
            for key in ('new', 'skipped', 'errors', 'foreign_skipped', 'unavailable_skipped'):
                if isinstance(output.get(key), int) and output[key] >= 0:
                    result[key] = output[key]
        except Excluded as error:
            result = {'status': 'excluded', 'reason': safe_reason(error.args[0] if error.args else None) or 'profile_excluded'}
        except StorageFull:
            result = {'status': 'storage_full', 'reason': 'storage_limit_reached'}
        except RetryableError as error:
            result = {'status': 'retry', 'reason': safe_reason(error.args[0] if error.args else None) or 'retryable_error'}
    except SourceChanged:
        result = {'status': 'source_changed', 'reason': 'source_changed'}
    except Exception:
        result = {'status': 'retry', 'reason': 'unexpected_error'}
    if result.get('status') not in RESULTS:
        result = {'status': 'retry'}
    atomic_json(result_path(config, owner), result)
    return 0


def read_result(config, owner):
    try:
        raw = json.loads(result_path(config, owner).read_text())
    except (FileNotFoundError, ValueError):
        return {'status': 'retry', 'reason': 'missing_result'}
    if not isinstance(raw, dict):
        return {'status': 'retry', 'reason': 'missing_result'}
    result = {'status': raw.get('status') if raw.get('status') in RESULTS else 'retry'}
    reason = safe_reason(raw.get('reason'))
    if reason:
        result['reason'] = reason
    for key in ('new', 'skipped', 'errors', 'foreign_skipped', 'unavailable_skipped'):
        if isinstance(raw.get(key), int) and raw[key] >= 0:
            result[key] = raw[key]
    return result


def finish_job(queue, worker, result, now):
    action = result['status']
    if action in ('done', 'excluded'):
        queue.complete(worker['handle'], worker['owner'], now)
    elif action in ('continue', 'storage_full', 'source_changed'):
        queue.release_owner(worker['owner'], now)
    else:
        queue.fail(worker['handle'], worker['owner'], now)


def stop_workers(queue, workers, slots=None):
    """Never release ownership while the associated process can still write."""
    selected = {slot: worker for slot, worker in workers.items() if slots is None or slot in slots}
    for worker in selected.values():
        if worker['process'].poll() is None:
            worker['process'].terminate()
    for slot, worker in selected.items():
        process = worker['process']
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
        queue.release_owner(worker['owner'], time.time())
        del workers[slot]


def spawn_worker(config_path, config, worker, pool_fd):
    env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8',
           'PYTHONUNBUFFERED': '1', 'PYTHONNOUSERSITE': '1', **config['env']}
    env['BOT_ID'] = str(worker['slot'])
    return subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '_worker',
        '--config', str(config_path), '--owner', worker['owner'], '--handle', worker['handle'],
        '--slot', str(worker['slot']), '--guard-fd', str(pool_fd)], env=env,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        pass_fds=(pool_fd,))


def run_service(config_path, config, stop=None, lock_dir=Path('/run/lock')):
    stop = stop or threading.Event()
    state_dir = Path(config['state_dir'])
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    (state_dir / 'results').mkdir(exist_ok=True, mode=0o700)
    Path(lock_dir).mkdir(parents=True, exist_ok=True, mode=0o700)
    singleton = try_lock(Path(lock_dir) / 'megabots-reprise.lock')
    if singleton is None:
        event('supervisor_already_running')
        return 1
    pool_fd = None
    queue = None
    workers = {}
    saved_status = status(state_dir)
    pause_until = saved_status.get('pause_until', 0)
    pause_kind = saved_status.get('pause_kind')
    try:
        while not stop.is_set() and pool_fd is None:
            pool_fd = try_lock(Path(lock_dir) / 'megabots-worker-pool.lock')
            if pool_fd is None:
                phase(state_dir, 'waiting_workers', pause_until=pause_until, pause_kind=pause_kind)
                stop.wait(5)
        if pool_fd is None:
            return 0
        verified_source(config)
        queue = Queue(state_dir / 'queue.sqlite3')
        # Acquiring the pool guard proves every previous managed child exited.
        for owner in queue.active_owners():
            queue.release_owner(owner, time.time())
        next_seed, seeded = 0, False
        while not stop.is_set():
            now = time.time()
            storage_full = False
            network_failed = False
            for slot, worker in list(workers.items()):
                code = worker['process'].poll()
                if code is None:
                    continue
                result = read_result(config, worker['owner']) if code == 0 else {'status': 'retry', 'reason': 'process_exit'}
                finish_job(queue, worker, result, now)
                event('worker_finished', slot=slot, **result)
                result_path(config, worker['owner']).unlink(missing_ok=True)
                storage_full |= result['status'] == 'storage_full'
                network_failed |= result['status'] == 'retry' and result.get('reason') in NETWORK_FAILURES
                del workers[slot]
            if storage_full:
                pause_until = now + 300
                pause_kind = 'storage'
                stop_workers(queue, workers)
            elif network_failed and (pause_kind != 'storage' or now >= pause_until):
                pause_until = max(pause_until if pause_kind == 'network' else 0, now + 60)
                pause_kind = 'network'
            if now >= pause_until:
                pause_until, pause_kind = 0, None
            disabled = read_control(state_dir)
            stop_workers(queue, workers, disabled)
            if now >= next_seed:
                try:
                    handles = load_catalogue(config)
                    inserted = queue.seed(handles, now, start_index=4000)
                    seeded, next_seed = True, now + 900
                    event('catalogue_seeded', eligible=len(handles), added=inserted)
                except Exception:
                    seeded = False
                    next_seed = now + 60
                    event('catalogue_unavailable')
            legacy = legacy_processes()
            if legacy:
                stop_workers(queue, workers)
                phase(state_dir, 'waiting_legacy', queue, legacy=legacy, pause_until=pause_until, pause_kind=pause_kind)
            elif now < pause_until:
                phase(state_dir, 'network_paused' if pause_kind == 'network' else 'storage_paused',
                      queue, workers, pause_until=pause_until, pause_kind=pause_kind)
            elif not seeded:
                phase(state_dir, 'paused_database', queue, workers)
            else:
                try:
                    verified_source(config)
                except SourceChanged:
                    stop_workers(queue, workers)
                    phase(state_dir, 'source_changed', queue)
                else:
                    for slot in range(1, 5):
                        if slot in workers or slot in disabled or stop.is_set():
                            continue
                        owner = str(uuid.uuid4())
                        job = queue.claim(owner, now)
                        if job is None:
                            break
                        worker = {**job, 'owner': owner, 'slot': slot}
                        try:
                            worker['process'] = spawn_worker(config_path, config, worker, pool_fd)
                        except Exception:
                            queue.fail(job['handle'], owner, now)
                            event('worker_start_failed', slot=slot)
                            continue
                        workers[slot] = worker
                        event('worker_started', slot=slot)
                    phase(state_dir, 'running' if workers else 'waiting_work', queue, workers)
            stop.wait(5)
        return 0
    finally:
        try:
            if queue is not None:
                try:
                    phase(state_dir, 'stopping', queue, workers, pause_until=pause_until, pause_kind=pause_kind)
                except Exception:
                    event('status_write_failed')
                stop_workers(queue, workers)
                try:
                    phase(state_dir, 'stopped', queue, pause_until=pause_until, pause_kind=pause_kind)
                except Exception:
                    event('status_write_failed')
        finally:
            if pool_fd is not None:
                os.close(pool_fd)
            os.close(singleton)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=('run', 'status', 'check', '_worker'))
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--owner')
    parser.add_argument('--handle')
    parser.add_argument('--slot', type=int)
    parser.add_argument('--guard-fd', type=int)
    args = parser.parse_args(argv)
    try:
        config = read_config(args.config)
        if args.command == 'status':
            print(json.dumps(status(config['state_dir'])))
            return 0
        if args.command == 'check':
            print(json.dumps(check(config)))
            return 0
        if args.command == '_worker':
            return run_child(config, args.owner, args.handle, args.slot, args.guard_fd)
        stop = threading.Event()
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: stop.set())
        return run_service(args.config.resolve(), config, stop)
    except KeyboardInterrupt:
        return 130
    except Exception as error:
        # Exception messages can include database credentials or signed URLs.
        event('failed', error_type=type(error).__name__)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
