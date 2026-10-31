"""Exercise guards with two connections in a newly created disposable schema.

Requires TEST_DATABASE_URL=mysql://user:password@localhost/photo_metadata_guard_test_<suffix>.
TEST_DATABASE_SOCKET selects a UNIX socket. An existing schema is never reused.
"""

import os
import re
from urllib.parse import unquote, urlsplit

import mysql.connector

from dmca_metadata_repair import ManifestRepair, result_exit_code


class GuardedCursor:
    def __init__(self, cursor, before_update):
        self.cursor, self.before_update = cursor, before_update

    def execute(self, sql, params=()):
        if sql.lstrip().startswith("UPDATE"):
            self.before_update()
        self.cursor.execute(sql, params)

    def fetchone(self):
        return self.cursor.fetchone()

    @property
    def rowcount(self):
        return self.cursor.rowcount


def main():
    url = urlsplit(os.environ["TEST_DATABASE_URL"])
    schema = url.path.removeprefix("/")
    if url.scheme not in {"mysql", "mariadb"} or url.hostname not in {"localhost", "127.0.0.1"}:
        raise ValueError("integration database must be explicitly local")
    if not re.fullmatch(r"photo_metadata_guard_test_[a-zA-Z0-9_]+", schema) or len(schema) > 64:
        raise ValueError("integration schema must have the disposable test prefix")
    config = dict(user=unquote(url.username or ""), password=unquote(url.password or ""), connection_timeout=10)
    if os.environ.get("TEST_DATABASE_SOCKET"):
        config["unix_socket"] = os.environ["TEST_DATABASE_SOCKET"]
    else:
        config.update(host=url.hostname, port=url.port or 3306)
    mutator = mysql.connector.connect(**config, autocommit=True)
    repair_db, created = None, False
    try:
        other = mutator.cursor()
        # CREATE fails if this schema exists; only a schema created here is dropped.
        other.execute(f"CREATE DATABASE `{schema}` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci")
        created = True
        other.execute(f"USE `{schema}`")
        other.execute("""CREATE TABLE creators (
            id VARCHAR(36) PRIMARY KEY, handle VARCHAR(100) UNIQUE,
            is_hidden TINYINT NOT NULL DEFAULT 0, removed_from_index_at DATETIME NULL) ENGINE=InnoDB""")
        other.execute("""CREATE TABLE photos (
            id VARCHAR(36) PRIMARY KEY, creator_id VARCHAR(36), source_id VARCHAR(100) NULL,
            url_version INT NULL, is_hidden TINYINT NOT NULL DEFAULT 0,
            removed_from_index_at DATETIME NULL) ENGINE=InnoDB""")
        other.execute("""CREATE TABLE bot_ingested (
            source_id BIGINT PRIMARY KEY, photo_id VARCHAR(36),
            creator_handle VARCHAR(100) COLLATE utf8mb4_unicode_ci,
            INDEX idx_bot_handle (creator_handle)) ENGINE=InnoDB""")
        repair_db = mysql.connector.connect(**config, database=schema, autocommit=False)
        checks = 0

        def state():
            other.execute("""SELECT p.source_id, p.url_version, p.is_hidden, p.removed_from_index_at,
                c.is_hidden, c.removed_from_index_at, p.creator_id, c.handle,
                (SELECT photo_id FROM bot_ingested WHERE source_id=42),
                (SELECT creator_handle FROM bot_ingested WHERE source_id=42)
                FROM photos p JOIN creators c ON c.id=p.creator_id WHERE p.id='photo-42'""")
            return other.fetchone()

        def check(expected, *, initial=None, race=None, source_id="42-v2", version=1, dry_run=False):
            nonlocal checks
            for table in ("bot_ingested", "photos", "creators"):
                other.execute(f"DELETE FROM {table}")
            other.execute("INSERT INTO creators (id,handle) VALUES ('creator-42','alice'),('other-creator','other')")
            other.execute("INSERT INTO photos (id,creator_id,source_id,url_version) VALUES ('photo-42','creator-42',%s,%s)", (source_id, version))
            other.execute("INSERT INTO bot_ingested VALUES (42,'photo-42','alice')")
            if initial:
                other.execute(initial)
            expected_state = state()

            def change():
                nonlocal expected_state
                if race:
                    other.execute(race)
                    expected_state = state()

            cursor = repair_db.cursor()
            try:
                result = ManifestRepair(GuardedCursor(cursor, change)).run(
                    set(), {("alice", "42", 2)}, dry_run=dry_run)
                repair_db.commit()
                assert dict(result) == {"checked": 1, expected: 1}, (expected, dict(result))
                if expected == "updated":
                    expected_state = ("42", 2 if source_id == "42-v2" else 1, *expected_state[2:])
                assert state() == expected_state, (expected, "unexpected metadata or visibility change")
                assert result_exit_code(result) == (2 if expected in {"concurrent_change", "not_indexable", "version_conflict"} else 0)
            finally:
                repair_db.rollback()
                cursor.close()
            checks += 1

        check("updated")
        check("updated", source_id=None)
        check("would_update", dry_run=True)
        check("version_conflict", version=23)
        check("version_conflict", version=23, dry_run=True)
        for table in ("photos", "creators"):
            for assignment in ("is_hidden=1", "removed_from_index_at='2026-10-31 12:00:00'"):
                mutation = f"UPDATE {table} SET {assignment}"
                check("not_indexable", initial=mutation)
                check("concurrent_change", race=mutation)
        for mutation in (
            "UPDATE bot_ingested SET photo_id='other-photo'",
            "UPDATE bot_ingested SET creator_handle='Alice'",
            "UPDATE creators SET handle='Alice' WHERE id='creator-42'",
            "UPDATE photos SET creator_id='other-creator'",
            "UPDATE photos SET source_id='42-V2'",
            "UPDATE photos SET url_version=23",
        ):
            check("concurrent_change", race=mutation)
        check("concurrent_change", source_id=None, race="UPDATE photos SET source_id=''")
    finally:
        if repair_db is not None:
            repair_db.rollback()
            repair_db.close()
        if created:
            mutator.cursor().execute(f"DROP DATABASE `{schema}`")
        mutator.close()
    print(f"PASS: {checks} MariaDB integration cases; two connections; disposable schema removed")


if __name__ == "__main__":
    main()
