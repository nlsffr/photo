"""Run one bounded discovery and bootstrap cycle for an authorized catalogue."""

import argparse
from collections import Counter
from contextlib import redirect_stderr, redirect_stdout
import json
import os
from pathlib import Path
import sqlite3
import stat
import time

from .adapter import RetryableError, StorageFull, load_source
from .bootstrap import (MAX_MEDIA, BootstrapError, approved_candidates, bootstrap_lock, check_queue_pause,
                        check_staging_space, run_approved)
from .discovery import (DiscoveryError, MAX_PAGES, MAX_PROFILE_CHECKS, SOURCE_ORIGIN,
                        SourceCatalogue, discover, read_existing)
from .supervisor import NETWORK_FAILURES, legacy_processes, read_config, source_environment, verified_source


MAX_IMPORTS_PER_CYCLE = 3
PROBE_COOLDOWN = 3600
EMPTY_COOLDOWN = 86400
SOURCE_COOLDOWN = 900
SCAN_COOLDOWN = 120
TERMINAL = ("published", "known", "excluded", "review")


class PendingQueue:
    """Private durable identities and retry times. The caller holds bootstrap_lock."""

    def __init__(self, path):
        fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
        try:
            meta = os.fstat(fd)
            if not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.geteuid() or meta.st_mode & 0o077:
                raise ValueError("queue_not_private")
        finally:
            os.close(fd)
        self.db = sqlite3.connect(path, timeout=5)
        try:
            self.db.execute("PRAGMA foreign_keys=ON")
            self.db.execute("PRAGMA synchronous=FULL")
            self.db.executescript("""
                CREATE TABLE IF NOT EXISTS candidates (
                    handle TEXT PRIMARY KEY,
                    aliases TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','published','known','excluded','review')),
                    attempts INTEGER NOT NULL DEFAULT 0,
                    available_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS candidates_due ON candidates(status, available_at);
                CREATE TABLE IF NOT EXISTS identities (
                    name TEXT PRIMARY KEY,
                    handle TEXT NOT NULL REFERENCES candidates(handle)
                );
                CREATE TABLE IF NOT EXISTS probes (
                    handle TEXT PRIMARY KEY,
                    available_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS runner_meta (
                    name TEXT PRIMARY KEY,
                    value INTEGER NOT NULL
                );
            """)
        except BaseException:
            self.db.close()
            raise

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.db.close()

    def admit(self, candidates, now):
        inserted = 0
        with self.db:
            for handle, aliases in candidates.items():
                names = (handle, *aliases)
                placeholders = ",".join("?" for _ in names)
                if self.db.execute(f"SELECT 1 FROM identities WHERE name IN ({placeholders}) LIMIT 1", names).fetchone():
                    continue
                self.db.execute("INSERT INTO candidates(handle, aliases, available_at) VALUES(?,?,?)",
                                (handle, json.dumps(aliases), now))
                self.db.executemany("INSERT INTO identities(name, handle) VALUES(?,?)",
                                    [(name, handle) for name in names])
                inserted += 1
        return inserted

    def skip_for_discovery(self, now):
        rows = self.db.execute("SELECT name FROM identities UNION SELECT handle FROM probes WHERE available_at>?", (now,))
        return {row[0] for row in rows}

    def defer_probes(self, handles, now):
        with self.db:
            self.db.execute("DELETE FROM probes WHERE available_at<=?", (now,))
            self.db.executemany("INSERT INTO probes(handle,available_at) VALUES(?,?) "
                                "ON CONFLICT(handle) DO UPDATE SET available_at=excluded.available_at",
                                [(handle, now + PROBE_COOLDOWN) for handle in handles])

    def _ready(self, name, now):
        row = self.db.execute("SELECT value FROM runner_meta WHERE name=?", (name,)).fetchone()
        return row is None or row[0] <= now

    def _defer(self, name, available_at):
        with self.db:
            self.db.execute("INSERT INTO runner_meta(name,value) VALUES(?,?) "
                            "ON CONFLICT(name) DO UPDATE SET value=MAX(value,excluded.value)",
                            (name, available_at))

    def source_ready(self, now):
        return self._ready("source_available_at", now)

    def pause_source(self, now):
        self._defer("source_available_at", now + SOURCE_COOLDOWN)

    def scan_ready(self, now):
        return self._ready("scan_available_at", now)

    def defer_scan(self, now):
        self._defer("scan_available_at", now + SCAN_COOLDOWN)

    def ready(self, now, limit):
        rows = self.db.execute("SELECT handle,aliases,attempts FROM candidates "
                               "WHERE status='pending' AND available_at<=? ORDER BY available_at,rowid LIMIT ?", (now, limit))
        return [(handle, tuple(json.loads(aliases)), attempts) for handle, aliases, attempts in rows]

    def start_attempt(self, handle, attempts, now):
        delay = min(3600, 60 * 2 ** min(attempts, 6))
        with self.db:
            self.db.execute("UPDATE candidates SET attempts=attempts+1, available_at=? WHERE handle=?",
                            (now + delay, handle))
        return delay

    def defer_attempt(self, handle, available_at):
        with self.db:
            self.db.execute("UPDATE candidates SET available_at=MAX(available_at,?) WHERE handle=?",
                            (available_at, handle))

    def finish(self, handle, outcome, now):
        with self.db:
            if outcome == "empty":
                self.db.execute("UPDATE candidates SET available_at=? WHERE handle=?", (now + EMPTY_COOLDOWN, handle))
            elif outcome in TERMINAL:
                self.db.execute("UPDATE candidates SET status=? WHERE handle=?", (outcome, handle))

    def pending_count(self):
        return self.db.execute("SELECT COUNT(*) FROM candidates WHERE status='pending'").fetchone()[0]


def read_seed_preview(path, indexes):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
        meta = os.fstat(stream.fileno())
        if not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.geteuid() or meta.st_mode & 0o077 or meta.st_size > 256 * 1024:
            raise ValueError("seed_not_private")
        body = stream.read(256 * 1024 + 1)
    if len(body) > 256 * 1024:
        raise ValueError("seed_too_large")
    document = json.loads(body)
    if not isinstance(document, dict) or document.get("approvalStatus") != "review_required":
        raise ValueError("seed_not_preview")
    entries = approved_candidates({**document, "approvalStatus": "approved"})
    if not indexes:
        return entries
    if len(indexes) != len(set(indexes)) or any(not 1 <= index <= len(entries) for index in indexes):
        raise ValueError("invalid_seed_index")
    ordered = list(entries.items())
    return dict(ordered[index - 1] for index in indexes)


def outcome_of(result):
    counts = result.get("counts") if isinstance(result, dict) and result.get("status") == "completed" else None
    if not isinstance(counts, dict):
        raise BootstrapError("invalid_bootstrap_result")
    outcomes = [(key, value) for key, value in counts.items() if key != "media"]
    if len(outcomes) != 1:
        raise BootstrapError("invalid_bootstrap_result")
    outcome, count = outcomes[0]
    if outcome not in ("published", "known", "excluded", "empty") or type(count) is not int or count != 1:
        raise BootstrapError("invalid_bootstrap_result")
    media = counts.get("media", 0)
    if type(media) is not int or (not 1 <= media <= MAX_MEDIA if outcome == "published" else media != 0):
        raise BootstrapError("invalid_bootstrap_result")
    return outcome, media


def run_cycle(queue, fetch, read_snapshot, import_one, *, pages, profile_limit, imports_per_cycle,
              now=time.time, seeds=None):
    if type(imports_per_cycle) is not int or not 1 <= imports_per_cycle <= MAX_IMPORTS_PER_CYCLE:
        raise ValueError("invalid_import_limit")
    counts = Counter()

    def report(status):
        return {"status": status, "counts": {**counts, "pending": queue.pending_count()}}

    if seeds:
        counts["seeded"] = queue.admit(seeds, int(now()))
    if not queue.source_ready(int(now())):
        return report("source_cooldown")
    ready = queue.ready(int(now()), imports_per_cycle)
    if len(ready) < imports_per_cycle and queue.scan_ready(int(now())):
        queue.defer_scan(int(now()))
        known, notices = read_snapshot()
        checked = set()
        try:
            manifest = discover(fetch, known | queue.skip_for_discovery(int(now())), notices,
                                pages=pages, profile_limit=profile_limit, on_profile_check=checked.add)
        except DiscoveryError:
            queue.defer_probes(checked, int(now()))
            queue.pause_source(int(now()))
            return report("source_deferred")
        finally:
            queue.defer_scan(int(now()))
        counts.update({f"scan_{key}": value for key, value in manifest["counts"].items()})

        discovered = {}
        for entry in manifest["candidates"]:
            try:
                discovered.update(approved_candidates({
                    "schemaVersion": 1, "source": "leakgallery", "approvalStatus": "approved", "candidates": [entry],
                }))
            except BootstrapError:
                counts["review"] += 1
        counts["enqueued"] = queue.admit(discovered, int(now()))
        queue.defer_probes(checked, int(now()))
        ready = queue.ready(int(now()), imports_per_cycle)

    for handle, aliases, attempts in ready:
        delay = queue.start_attempt(handle, attempts, int(now()))
        counts["attempted"] += 1
        try:
            outcome, media = outcome_of(import_one(handle, aliases))
        except StorageFull:
            queue.defer_attempt(handle, int(now()) + delay)
            return report("storage_full")
        except RetryableError as error:
            reason = error.args[0] if error.args else None
            if reason == "bootstrap_identity_changed":
                queue.finish(handle, "review", int(now()))
                counts["review"] += 1
            else:
                counts["retry"] += 1
                queue.defer_attempt(handle, int(now()) + delay)
            if isinstance(reason, str) and (reason in NETWORK_FAILURES or reason == "queue_network_paused"):
                queue.pause_source(int(now()))
                return report("source_deferred")
        except BootstrapError:
            queue.finish(handle, "review", int(now()))
            counts["review"] += 1
        except Exception:
            queue.defer_attempt(handle, int(now()) + delay)
            counts["errors"] += 1
            return report("stopped")
        else:
            queue.finish(handle, outcome, int(now()))
            counts[outcome] += 1
            counts["media"] += media
    return report("completed")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/etc/megabot-queue/config.json")
    parser.add_argument("--aliases", required=True)
    parser.add_argument("--pages", required=True, type=int, choices=range(1, MAX_PAGES + 1))
    parser.add_argument("--profile-limit", required=True, type=int, choices=range(1, MAX_PROFILE_CHECKS + 1))
    parser.add_argument("--imports-per-cycle", required=True, type=int, choices=range(1, MAX_IMPORTS_PER_CYCLE + 1))
    parser.add_argument("--authorized-catalogue", required=True, choices=("leakgallery",))
    parser.add_argument("--seed-preview", type=Path)
    parser.add_argument("--seed-index", action="append", type=int, default=[],
                        help="1-based selected entry in the private seed preview. Repeat to select multiple.")
    parser.add_argument("--apply", action="store_true", required=True)
    args = parser.parse_args(argv)
    if args.seed_index and args.seed_preview is None:
        parser.error("--seed-index requires --seed-preview")

    try:
        import requests

        config = read_config(args.config)
        verified_source(config)
        env = config["env"]
        state = Path(config["state_dir"])
        aliases = json.loads(Path(args.aliases).read_text())["aliases"]
        if not isinstance(aliases, dict) or any(not isinstance(values, list) or
                any(not isinstance(value, str) for value in values) for values in aliases.values()):
            raise ValueError("invalid_alias_map")
        seeds = read_seed_preview(args.seed_preview, args.seed_index) if args.seed_preview else None
        if legacy_processes():
            raise BootstrapError("legacy_workers_active")

        def import_one(handle, historical):
            check_queue_pause(state)
            check_staging_space(state)
            verified_source(config)
            with open(os.devnull, "w") as sink, redirect_stdout(sink), redirect_stderr(sink), source_environment(env):
                source = load_source(config["source_path"])
                if source.Config.BASE_URL.rstrip("/") != SOURCE_ORIGIN:
                    raise BootstrapError("unexpected_source")
                database = source.MariaDB()
                try:
                    return run_approved(database, {handle: historical}, aliases, config, apply=True)
                finally:
                    database.close()

        with bootstrap_lock(state), PendingQueue(state / "creator-scale.sqlite3") as queue, requests.Session() as session:
            check_queue_pause(state)
            check_staging_space(state)
            session.trust_env = False
            session.headers["Accept"] = "application/json"
            proxies = [part.strip() for part in env.get("MEGABOT_PROXIES", "").split(",") if part.strip()]
            source = SourceCatalogue(session, env.get("MEGABOT_BASE_URL", SOURCE_ORIGIN), proxies)
            report = run_cycle(queue, source.fetch, lambda: read_existing(env), import_one,
                               pages=args.pages, profile_limit=args.profile_limit,
                               imports_per_cycle=args.imports_per_cycle, seeds=seeds)
    except BlockingIOError:
        report = {"status": "busy"}
    except StorageFull:
        report = {"status": "storage_full"}
    except RetryableError:
        report = {"status": "source_deferred"}
    except Exception:
        report = {"status": "stopped"}
    print(json.dumps(report))
    return 0 if report["status"] in ("completed", "source_cooldown") else 1


if __name__ == "__main__":
    raise SystemExit(main())
