#!/usr/bin/env python3
"""Run bounded repair processes under one durable, exclusive coordinator.

Only the coordinator touches the checkpoint. Each child creates its own repair
runtime and retains the inherited leader lock until it exits. Publication and
withdrawal checks remain entirely in the existing repair implementations.
"""
from __future__ import annotations

import argparse
from collections import Counter
import fcntl
import hashlib
import importlib.util
import json
import math
import multiprocessing
import os
from pathlib import Path
import re
import signal
import stat
import time
import types


def load_sibling(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    if spec is None or spec.loader is None:
        raise RuntimeError('repair_module_unavailable')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


shared = load_sibling('_media_worker_shared', 'backfill-missing-video-assets.py')


class SourceBackoff:
    """A short blocking lock coordinates pauses across both checkpoint files."""
    def __init__(self, path):
        self.path = Path(path) if path is not None else None
        if self.path is not None:
            shared.private_directory(self.path.parent)

    def deadline(self, proposed=0):
        if self.path is None:
            return proposed
        fd = os.open(str(self.path)+'.lock', os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
                raise shared.BackfillError('source_backoff_not_private')
            fcntl.flock(fd, fcntl.LOCK_EX)
            current = 0
            if self.path.exists():
                data, _ = shared.read_private_json(self.path)
                current = data.get('not_before') if isinstance(data, dict) else None
                if (type(current) not in (int, float) or not math.isfinite(current) or current < 0):
                    raise shared.BackfillError('source_backoff_invalid')
            deadline = max(current, proposed)
            if proposed > current:
                shared.atomic_json(self.path, {'not_before': deadline})
            return deadline
        finally:
            os.close(fd)


def stop_cleanly(*_):
    raise KeyboardInterrupt


def repair_child(sender, receiver, inherited_receivers, state, repair, config,
                 journal, locks, expected, runtime_factory):
    # No SQLite connection, network session or API client is shared by workers.
    receiver.close()
    for connection in inherited_receivers:
        connection.close()
    state.close()
    os.setsid()
    signal.signal(signal.SIGTERM, stop_cleanly)
    runtime = None
    try:
        lock = locks/(hashlib.sha256(expected['id'].encode()).hexdigest()+'.lock')
        with shared.file_lock(lock):
            factory = runtime_factory or repair.Repair
            runtime = factory(config, journal)
            outcome = runtime.run(expected, apply=True)
        if not isinstance(outcome, dict) or outcome.get('status') not in ('restored', 'already_present'):
            result = {'ok': False, 'reason': 'unexpected_repair_result'}
        else:
            result = {'ok': True, 'status': outcome['status']}
    except BaseException as error:
        result = {'ok': False, 'reason': shared.safe_reason(error, repair)}
    finally:
        if runtime is not None:
            try:
                runtime.close()
            except Exception:
                pass
    try:
        sender.send(result)
    except (BrokenPipeError, EOFError, OSError):
        pass
    finally:
        sender.close()


def stop_children(active):
    # Signal the child's process group too, so ffmpeg cannot outlive its worker.
    for entry in active:
        process = entry['process']
        if process.is_alive():
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                process.terminate()
    deadline = time.monotonic()+3
    for entry in active:
        entry['process'].join(max(0, deadline-time.monotonic()))
    for entry in active:
        process = entry['process']
        if process.is_alive():
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                process.kill()
            process.join()
        entry['receiver'].close()
        process.close()


def run_pool(plan, digest, state_dir, repair, config, *, workers=3, max_items=100,
             delay=2, lock_dir=None, clock=time.time, sleep=time.sleep,
             runtime_factory=None, source_backoff=None):
    if (type(workers) is not int or not 1 <= workers <= 4
            or type(max_items) is not int or not 1 <= max_items <= shared.MAX_SESSION_ITEMS
            or not math.isfinite(delay) or delay < 2):
        raise shared.BackfillError('run_limits_invalid')
    rows = shared.validate_plan(plan)
    root = shared.private_directory(state_dir)
    locks = shared.private_directory(lock_dir or root/'job-locks')
    source_pause = SourceBackoff(source_backoff)
    context = multiprocessing.get_context('fork')
    active = []
    attempted = 0
    counters = Counter()
    state = None
    paused = False
    previous_term = signal.signal(signal.SIGTERM, stop_cleanly)
    try:
        with shared.file_lock(root/'driver.lock'):
            try:
                state = shared.State(root, rows, digest)

                def deadline():
                    return max(float(state.get_meta('global_not_before', '0')), source_pause.deadline())

                def progress(phase, **extra):
                    result = {'phase': phase, 'attempted': attempted,
                              'session': dict(counters), 'jobs': state.summary(), **extra}
                    shared.atomic_json(root/'progress.json', result)
                    return result

                pause_until = deadline()
                if clock() < pause_until:
                    return progress('paused', not_before=pause_until)
                while active or (attempted < max_items and not paused):
                    # Reap before dispatch: a completed failure must stop new work.
                    for entry in list(active):
                        process, receiver, job = entry['process'], entry['receiver'], entry['job']
                        if process.is_alive():
                            continue
                        process.join()
                        try:
                            outcome = receiver.recv() if receiver.poll() else None
                        except (EOFError, OSError):
                            outcome = None
                        if (process.exitcode != 0 or not isinstance(outcome, dict)
                                or type(outcome.get('ok')) is not bool):
                            outcome = {'ok': False, 'reason': 'worker_exited'}
                        receiver.close(); process.close(); active.remove(entry)
                        pause_until = deadline()
                        if outcome['ok']:
                            status = outcome.get('status')
                            if status not in ('restored', 'already_present'):
                                outcome = {'ok': False, 'reason': 'unexpected_repair_result'}
                        if outcome['ok']:
                            public = {'id': job['id'], 'status': status}
                            state.finish(job['id'], 'done', public, 0, pause_until)
                            counters[status] += 1
                        else:
                            reason = outcome.get('reason')
                            if not isinstance(reason, str) or not re.fullmatch(r'[a-z0-9_]{1,80}', reason):
                                reason = 'runtime_failure'
                            skipped = reason in shared.SKIP_CODES
                            public = {'id': job['id'], 'status': 'skipped' if skipped else 'retry', 'reason': reason}
                            if not skipped:
                                paused = True
                                pause_until = source_pause.deadline(max(pause_until, clock()+shared.NETWORK_BACKOFF))
                            state.finish(job['id'], public['status'], public,
                                         0 if skipped else pause_until, pause_until)
                            counters[public['status']] += 1
                        shared.append_event(root/'events.jsonl', public, clock())
                        progress('paused_network' if paused else 'running', **({'not_before':pause_until} if paused else {}))
                    if paused:
                        if active:
                            sleep(.05)
                        continue
                    # A pause from the other media pool also drains current jobs.
                    pause_until = deadline()
                    if source_pause.deadline() > clock():
                        paused = True
                        continue
                    if attempted < max_items and len(active) < workers and clock() >= pause_until:
                        job = state.next_job(clock())
                        if job is None:
                            if not active:
                                break
                        else:
                            receiver, sender = context.Pipe(duplex=False)
                            process = context.Process(target=repair_child, args=(sender, receiver,
                                [entry['receiver'] for entry in active], state, repair, config,
                                root/'repair.jsonl', locks, json.loads(job['expected']), runtime_factory))
                            try:
                                process.start()
                            except BaseException:
                                receiver.close(); sender.close(); process.close()
                                raise
                            sender.close()
                            active.append({'process': process, 'receiver': receiver, 'job': job})
                            attempted += 1
                            # Persist launch spacing, rather than spacing completions.
                            state.set_meta('global_not_before', max(pause_until, clock()+delay))
                            progress('running')
                            continue
                    if active or attempted < max_items:
                        # With a free slot the next useful event is the launch
                        # deadline. Still reap failures at least once a second.
                        waiting_for_slot = len(active) >= workers or attempted >= max_items
                        wait = .05 if active and waiting_for_slot else min(1, max(.05, pause_until-clock()))
                        sleep(wait)
                return progress('paused_network' if paused else 'session_complete',
                                **({'not_before':deadline()} if paused else {}))
            finally:
                # A second termination signal must not interrupt child cleanup.
                signal.signal(signal.SIGTERM, signal.SIG_IGN)
                stop_children(active)
                if state is not None:
                    state.close()
    finally:
        signal.signal(signal.SIGTERM, previous_term)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=('video', 'photo'), required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--state-dir', type=Path, required=True)
    parser.add_argument('--config', default='/etc/megabot-queue/config.json')
    parser.add_argument('--job-lock-dir', type=Path, default=Path('/var/lib/video-repair/job-locks'))
    parser.add_argument('--source-backoff', type=Path, default=Path('/var/lib/video-repair/backfill/source-backoff.json'))
    parser.add_argument('--workers', type=int)
    parser.add_argument('--max-items', type=int, default=100)
    parser.add_argument('--delay', type=float, default=2)
    args = parser.parse_args(argv)
    try:
        plan, digest = shared.read_private_json(args.plan)
        if args.kind == 'photo':
            module = load_sibling('_media_worker_photos', 'backfill-missing-photos.py')
            if plan.get('kind') != 'photo-assets':
                raise shared.BackfillError('photo_plan_invalid')
            shared.SKIP_CODES = shared.SKIP_CODES | module.PHOTO_SKIPS
            repair = types.SimpleNamespace(Repair=module.Runtime, RepairError=module.photo.RepairError)
        else:
            if plan.get('kind') == 'photo-assets':
                raise shared.BackfillError('video_plan_invalid')
            repair = shared.load_repair()
        print(json.dumps(run_pool(plan, digest, args.state_dir, repair, args.config,
            workers=args.workers if args.workers is not None else (2 if args.kind == 'photo' else 3),
            max_items=args.max_items, delay=args.delay, lock_dir=args.job_lock_dir,
            source_backoff=args.source_backoff)))
        return 0
    except Exception as error:
        reason = str(error) if isinstance(error, shared.BackfillError) else type(error).__name__
        print(json.dumps({'phase':'failed', 'reason':reason if re.fullmatch(r'[A-Za-z0-9_]{1,80}', reason) else 'failed'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
