"""Persistent, exclusive profile jobs for workers on one host.

Times are Unix timestamps supplied by the supervisor. Active jobs never expire:
release_owner is only safe after that owner's process has actually stopped.
"""

from contextlib import contextmanager
import math
from pathlib import Path
import sqlite3


REFRESH_SECONDS = 24 * 60 * 60
RETRY_SECONDS = 60
MAX_RETRY_SECONDS = 60 * 60


class OwnershipError(RuntimeError):
    """The caller does not own this active job."""


def _timestamp(value):
    value = float(value)
    if not math.isfinite(value):
        raise ValueError("now must be a finite Unix timestamp")
    return value


def _owner(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("owner must be a nonempty process identity")
    return value


class Queue:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self._connection() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("BEGIN IMMEDIATE")
            try:
                db.execute("""
                    CREATE TABLE IF NOT EXISTS jobs (
                        handle TEXT PRIMARY KEY COLLATE NOCASE,
                        priority INTEGER NOT NULL UNIQUE,
                        state TEXT NOT NULL DEFAULT 'pending'
                            CHECK (state IN ('pending', 'active', 'done')),
                        owner TEXT,
                        next_page INTEGER NOT NULL DEFAULT 1 CHECK (next_page >= 1),
                        empty_streak INTEGER NOT NULL DEFAULT 0 CHECK (empty_streak >= 0),
                        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                        failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
                        available_at REAL NOT NULL,
                        CHECK ((state = 'active' AND owner IS NOT NULL)
                            OR (state != 'active' AND owner IS NULL))
                    )
                """)
                columns = {row['name'] for row in db.execute('PRAGMA table_info(jobs)')}
                if 'failures' not in columns:
                    db.execute('ALTER TABLE jobs ADD COLUMN failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0)')
                db.execute("CREATE INDEX IF NOT EXISTS jobs_ready ON jobs(state, available_at, priority)")
                db.execute('COMMIT')
            except BaseException:
                db.execute('ROLLBACK')
                raise

    @contextmanager
    def _connection(self):
        db = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA synchronous=FULL")
            yield db
        finally:
            db.close()

    @contextmanager
    def _transaction(self):
        with self._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise

    def seed(self, handles: list[str], now, start_index=4000):
        """Append unseen handles in rotated order; never reset existing jobs.

        Supply a fixed, eligible catalog snapshot. ASCII handle casing is ignored
        for uniqueness, while the first supplied spelling is kept for requests.
        """
        now = _timestamp(now)
        if not isinstance(start_index, int) or start_index < 0:
            raise ValueError("start_index must be a nonnegative integer")
        if any(not isinstance(h, str) or not h.strip() for h in handles):
            raise ValueError("handles must be nonempty strings")
        rotated = handles[start_index:] + handles[:start_index]
        inserted = 0
        with self._transaction() as db:
            priority = db.execute("SELECT COALESCE(MAX(priority), -1) + 1 FROM jobs").fetchone()[0]
            for handle in rotated:
                cursor = db.execute(
                    "INSERT OR IGNORE INTO jobs(handle, priority, available_at) VALUES (?, ?, ?)",
                    (handle.strip(), priority, now),
                )
                inserted += cursor.rowcount
                priority += cursor.rowcount
        return inserted

    def claim(self, owner: str, now):
        """Claim one ready job. New/retry jobs precede due refreshes."""
        owner, now = _owner(owner), _timestamp(now)
        with self._transaction() as db:
            row = db.execute("""
                SELECT * FROM jobs WHERE state IN ('pending', 'done') AND available_at <= ?
                ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END, priority LIMIT 1
            """, (now,)).fetchone()
            if row is None:
                return None
            refresh = row['state'] == 'done'
            job = dict(handle=row['handle'], next_page=1 if refresh else row['next_page'],
                       empty_streak=0 if refresh else row['empty_streak'],
                       attempts=1 if refresh else row['attempts'] + 1)
            db.execute("""
                UPDATE jobs SET state='active', owner=?, next_page=?, empty_streak=?, attempts=?, failures=?
                WHERE handle=?
            """, (owner, job['next_page'], job['empty_streak'], job['attempts'],
                  0 if refresh else row['failures'], job['handle']))
            return job

    @staticmethod
    def _require_owned(cursor):
        if cursor.rowcount != 1:
            raise OwnershipError("job is not active for this owner")

    def checkpoint(self, handle, owner, next_page, empty_streak):
        owner = _owner(owner)
        if not isinstance(next_page, int) or next_page < 1:
            raise ValueError("next_page must be a positive integer")
        if not isinstance(empty_streak, int) or empty_streak < 0:
            raise ValueError("empty_streak must be a nonnegative integer")
        with self._transaction() as db:
            self._require_owned(db.execute("""
                UPDATE jobs SET next_page=?, empty_streak=?, failures=0
                WHERE handle=? AND state='active' AND owner=?
            """, (next_page, empty_streak, handle, owner)))

    def complete(self, handle, owner, now):
        owner, now = _owner(owner), _timestamp(now)
        with self._transaction() as db:
            self._require_owned(db.execute("""
                UPDATE jobs SET state='done', owner=NULL, available_at=?
                WHERE handle=? AND state='active' AND owner=?
            """, (now + REFRESH_SECONDS, handle, owner)))

    def fail(self, handle, owner, now):
        """Release after an actual failure; keep the last durable checkpoint."""
        owner, now = _owner(owner), _timestamp(now)
        with self._transaction() as db:
            row = db.execute("""
                SELECT failures FROM jobs WHERE handle=? AND state='active' AND owner=?
            """, (handle, owner)).fetchone()
            if row is None:
                raise OwnershipError("job is not active for this owner")
            delay = min(MAX_RETRY_SECONDS, RETRY_SECONDS * 2 ** min(row['failures'], 6))
            available_at = now + delay
            db.execute("""
                UPDATE jobs SET state='pending', owner=NULL, available_at=?, failures=failures+1 WHERE handle=?
            """, (available_at, handle))
            return available_at

    def release_owner(self, owner, now):
        """Recover jobs only after the supervisor has verified the owner exited."""
        owner, now = _owner(owner), _timestamp(now)
        with self._transaction() as db:
            return db.execute("""
                UPDATE jobs SET state='pending', owner=NULL, available_at=?
                WHERE state='active' AND owner=?
            """, (now, owner)).rowcount

    def stats(self):
        with self._connection() as db:
            counts = {'pending': 0, 'active': 0, 'done': 0}
            counts.update(dict(db.execute("SELECT state, COUNT(*) FROM jobs GROUP BY state")))
            return {'total': sum(counts.values()), **counts}

    def active_owners(self):
        with self._connection() as db:
            return [row[0] for row in db.execute("SELECT DISTINCT owner FROM jobs WHERE state='active'")]

    def owned_job(self, handle, owner):
        with self._connection() as db:
            row = db.execute("""
                SELECT handle, next_page, empty_streak, attempts FROM jobs
                WHERE handle=? AND state='active' AND owner=?
            """, (handle, _owner(owner))).fetchone()
            if row is None:
                raise OwnershipError("job is not active for this owner")
            return dict(row)
