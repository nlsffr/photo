#!/usr/bin/env python3
"""Exercise reimport SQL against session-local temporary tables only.

DATABASE_URL supplies existing credentials. --db-host/--db-port may select the
existing endpoint, but no credential is accepted on the command line. Importing
this module does not connect. Closing the dedicated connection drops fixtures.
"""

import argparse
import copy
import datetime
import importlib.util
import json
import os
from pathlib import Path
import re
import sys


TABLES = {"creators", "photos"}
CREATOR = "00000000-0000-0000-0000-000000000001"
OTHER_CREATOR = "00000000-0000-0000-0000-000000000002"
MEDIA = "00000000-0000-0000-0000-000000000042"
OTHER_MEDIA = "00000000-0000-0000-0000-000000000043"
STAMP = datetime.datetime(2000, 1, 1)


class IsolationError(RuntimeError):
    pass


class TemporarySandbox:
    def __init__(self, connection):
        self.connection = connection
        self.created = set()
        self.current_case = None

    def create(self):
        cursor = self.connection.cursor(buffered=True)
        try:
            cursor.execute("""CREATE TEMPORARY TABLE creators (
                id CHAR(36) PRIMARY KEY,
                handle VARCHAR(100) NOT NULL,
                url_version INT NULL DEFAULT 1,
                is_hidden TINYINT NOT NULL DEFAULT 0,
                removed_from_index_at DATETIME NULL,
                updated_at DATETIME NULL,
                UNIQUE KEY creator_handle (handle)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
            self.created.add("creators")
            cursor.execute("""CREATE TEMPORARY TABLE photos (
                id CHAR(36) PRIMARY KEY,
                creator_id CHAR(36) NOT NULL,
                source_id VARCHAR(191) NULL,
                url_version INT NULL DEFAULT 1,
                is_hidden TINYINT NOT NULL DEFAULT 0,
                removed_from_index_at DATETIME NULL,
                updated_at DATETIME NULL,
                KEY source_id (source_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""")
            self.created.add("photos")
        finally:
            cursor.close()
        self.verify()

    def verify(self):
        if self.created != TABLES:
            raise IsolationError("both temporary fixtures must be created")
        cursor = self.connection.cursor(dictionary=True, buffered=True)
        try:
            for table in sorted(TABLES):
                cursor.execute(f"SHOW CREATE TABLE `{table}`")
                row = cursor.fetchone()
                statement = row.get("Create Table", "") if row else ""
                if not re.match(rf"CREATE\s+TEMPORARY\s+TABLE\s+`{table}`\s", statement, re.I):
                    raise IsolationError("fixture does not shadow a persistent table")
        finally:
            cursor.close()

    def cursor(self, before_update=None):
        self.verify()
        return GuardedCursor(self, before_update)

    def reset(self):
        self.verify()
        cursor = self.connection.cursor(buffered=True)
        try:
            cursor.execute("DELETE FROM photos")
            cursor.execute("DELETE FROM creators")
            cursor.executemany(
                "INSERT INTO creators (id,handle,url_version,updated_at) VALUES (%s,%s,1,%s)",
                [(CREATOR, "alice", STAMP), (OTHER_CREATOR, "bob", STAMP)],
            )
            cursor.executemany(
                """INSERT INTO photos (id,creator_id,source_id,url_version,updated_at)
                   VALUES (%s,%s,%s,%s,%s)""",
                [(MEDIA, CREATOR, "42", 1, STAMP), (OTHER_MEDIA, OTHER_CREATOR, "43", 7, STAMP)],
            )
        finally:
            cursor.close()

    def execute_fixture(self, sql, params=()):
        validate_statement(sql, fixture=True)
        self.verify()
        cursor = self.connection.cursor(buffered=True)
        try:
            cursor.execute(sql, params)
        finally:
            cursor.close()

    def snapshot(self):
        self.verify()
        cursor = self.connection.cursor(dictionary=True, buffered=True)
        try:
            result = {}
            for table in sorted(TABLES):
                cursor.execute(f"SELECT * FROM `{table}` ORDER BY id")
                result[table] = cursor.fetchall()
            return result
        finally:
            cursor.close()


def validate_statement(sql, *, fixture=False):
    normalized = " ".join(sql.split())
    allowed = {"SELECT", "UPDATE", "INSERT"} if fixture else {"SELECT", "UPDATE"}
    if not normalized or normalized.split()[0].upper() not in allowed:
        raise IsolationError("unexpected statement type")
    if re.search(r";|--|/\*|\b(?:DROP|TRUNCATE|ALTER|CREATE|CALL|UNION|OUTFILE|DUMPFILE)\b", normalized, re.I):
        raise IsolationError("unsafe statement syntax")
    references = re.findall(r"\b(?:FROM|JOIN|UPDATE|INTO)\s+([A-Za-z0-9_`.]+)", normalized, re.I)
    if not references or any(name.strip("`").lower() not in TABLES for name in references):
        raise IsolationError("statement references a non-fixture table")
    if normalized.upper().startswith("SELECT ") and re.search(r"\bINTO\b", normalized, re.I):
        raise IsolationError("SELECT INTO is not allowed")
    if normalized.upper().startswith("UPDATE "):
        before_set = re.split(r"\bSET\b", normalized, maxsplit=1, flags=re.I)[0]
        if "," in before_set:
            raise IsolationError("comma-separated UPDATE tables are not allowed")


class GuardedCursor:
    def __init__(self, sandbox, before_update):
        self.sandbox = sandbox
        self.raw = sandbox.connection.cursor(dictionary=True, buffered=True)
        self.before_update = before_update

    def execute(self, sql, params=()):
        validate_statement(sql)
        if sql.lstrip().upper().startswith("UPDATE ") and self.before_update:
            callback, self.before_update = self.before_update, None
            callback()
        self.sandbox.verify()
        self.raw.execute(sql, params)

    def fetchall(self):
        return self.raw.fetchall()

    @property
    def rowcount(self):
        return self.raw.rowcount

    def close(self):
        self.raw.close()


def run_cases(module, sandbox):
    passed = []

    def call(target, *, apply=True, before_update=None):
        sandbox.verify()
        cursor = sandbox.cursor(before_update)
        try:
            return module.process_target(cursor, target, apply=apply)
        finally:
            cursor.close()

    def expect(result, status, writes=0):
        assert result["status"] == status, "unexpected target status"
        assert result["writes"] == writes, "unexpected write count"

    def applied_change(before, table, identifier, version):
        actual = sandbox.snapshot()
        expected = copy.deepcopy(before)
        row = next(item for item in expected[table] if item["id"] == identifier)
        updated = next(item for item in actual[table] if item["id"] == identifier)
        assert updated["updated_at"] != row["updated_at"], "update timestamp did not change"
        row.update(url_version=version, updated_at=updated["updated_at"])
        assert actual == expected, "unexpected fixture mutation"

    def unchanged_case(name, target, status, setup=None, *, apply=True, race=None):
        sandbox.current_case = name
        sandbox.reset()
        if setup:
            setup()
        expected = sandbox.snapshot()

        def interleave():
            nonlocal expected
            race()
            expected = sandbox.snapshot()

        expect(call(target, apply=apply, before_update=interleave if race else None), status)
        assert sandbox.snapshot() == expected, "blocked target changed a fixture"
        sandbox.connection.rollback()
        passed.append(name)

    sandbox.current_case = "media-update-and-replay"
    sandbox.reset()
    before = sandbox.snapshot()
    expect(call(("alice", "42", 1)), "bumped_media", 1)
    applied_change(before, "photos", MEDIA, 2)
    after = sandbox.snapshot()
    expect(call(("alice", "42", 1)), "already_advanced")
    assert sandbox.snapshot() == after, "replayed URL wrote again"
    sandbox.connection.rollback()
    passed.append("media-update-and-replay")

    sandbox.current_case = "joined-update-with-null-source-and-version"
    sandbox.reset()
    sandbox.execute_fixture("UPDATE photos SET source_id=NULL,url_version=NULL WHERE id=%s", (MEDIA,))
    before = sandbox.snapshot()
    expect(call(("alice", MEDIA, 1)), "bumped_media", 1)
    applied_change(before, "photos", MEDIA, 2)
    sandbox.connection.rollback()
    passed.append("joined-update-with-null-source-and-version")

    sandbox.current_case = "creator-only-update-and-replay"
    sandbox.reset()
    before = sandbox.snapshot()
    expect(call(("alice", None, 1)), "bumped_creator", 1)
    applied_change(before, "creators", CREATOR, 2)
    after = sandbox.snapshot()
    expect(call(("alice", None, 1)), "already_advanced")
    assert sandbox.snapshot() == after, "creator replay wrote again"
    sandbox.connection.rollback()
    passed.append("creator-only-update-and-replay")

    unchanged_case("dry-run", ("alice", "42", 1), "would_bump_media", apply=False)
    unchanged_case("wrong-owner", ("bob", "42", 1), "not_found")
    unchanged_case("missing-media", ("alice", "999", 1), "not_found")
    unchanged_case("uuid-alias-is-not-canonical", ("alice", MEDIA, 1), "non_canonical_target")
    unchanged_case("duplicate-source", ("alice", "42", 1), "ambiguous_target",
                   lambda: sandbox.execute_fixture("UPDATE photos SET creator_id=%s,source_id='42' WHERE id=%s", (CREATOR, OTHER_MEDIA)))
    unchanged_case("duplicate-source-other-owner", ("alice", "42", 1), "ambiguous_target",
                   lambda: sandbox.execute_fixture("UPDATE photos SET source_id='42' WHERE id=%s", (OTHER_MEDIA,)))
    unchanged_case("stale-media-version", ("alice", "42", 1), "stale_url",
                   lambda: sandbox.execute_fixture("UPDATE photos SET url_version=4 WHERE id=%s", (MEDIA,)))
    unchanged_case("stale-creator-version", ("alice", None, 1), "stale_url",
                   lambda: sandbox.execute_fixture("UPDATE creators SET url_version=4 WHERE id=%s", (CREATOR,)))

    for table, identifier in (("photos", MEDIA), ("creators", CREATOR)):
        for field, value in (("is_hidden", 1), ("removed_from_index_at", STAMP)):
            mutation = lambda table=table, identifier=identifier, field=field, value=value: sandbox.execute_fixture(
                f"UPDATE {table} SET {field}=%s WHERE id=%s", (value, identifier))
            unchanged_case(f"blocked-numeric-{table}-{field}", ("alice", "42", 1), "not_found", mutation)

            def private_uuid(mutation=mutation):
                sandbox.execute_fixture("UPDATE photos SET source_id=NULL WHERE id=%s", (MEDIA,))
                mutation()

            unchanged_case(f"blocked-uuid-{table}-{field}", ("alice", MEDIA, 1), "not_public", private_uuid)
            unchanged_case(f"interleaved-{table}-{field}", ("alice", "42", 1), "concurrent_change", race=mutation)

    for name, sql, params in (
        ("version", "UPDATE photos SET url_version=3 WHERE id=%s", (MEDIA,)),
        ("owner", "UPDATE photos SET creator_id=%s WHERE id=%s", (OTHER_CREATOR, MEDIA)),
        ("source-exactness", "UPDATE photos SET source_id='42 ' WHERE id=%s", (MEDIA,)),
        ("handle-exactness", "UPDATE creators SET handle='Alice' WHERE id=%s", (CREATOR,)),
    ):
        unchanged_case(f"interleaved-{name}", ("alice", "42", 1), "concurrent_change",
                       race=lambda sql=sql, params=params: sandbox.execute_fixture(sql, params))
    return passed


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--script", type=Path, required=True)
    parser.add_argument("--db-host", default=os.environ.get("REIMPORT_TEST_DB_HOST"))
    parser.add_argument("--db-port", type=int)
    args = parser.parse_args(argv)
    connection = sandbox = None
    phase = "load-script"
    try:
        spec = importlib.util.spec_from_file_location("reimport_integration_target", args.script.resolve())
        if spec is None or spec.loader is None:
            raise ValueError("candidate module unavailable")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        phase = "connect"
        config = module.database_config(os.environ["DATABASE_URL"], host=args.db_host, port=args.db_port)
        config["autocommit"] = False
        import mysql.connector
        connection = mysql.connector.connect(**config)
        phase = "create-and-verify-temporary-tables"
        sandbox = TemporarySandbox(connection)
        sandbox.create()
        phase = "fixture-cases"
        passed = run_cases(module, sandbox)
        sandbox.verify()
        connection.rollback()
        connection.close()
        connection = None
        print(json.dumps({"ok": True, "checks": len(passed), "cases": passed,
                          "temporary_tables_only": True, "commits": 0,
                          "persistent_row_writes": 0, "session_closed": True}))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "phase": phase, "error_type": type(error).__name__,
                          "case": getattr(sandbox, "current_case", None),
                          "errno": getattr(error, "errno", None), "details_omitted": True}), file=sys.stderr)
        return 1
    finally:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
            try:
                connection.close()
            except Exception as error:
                print(json.dumps({"ok": False, "phase": "cleanup", "error_type": type(error).__name__,
                                  "details_omitted": True}), file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
