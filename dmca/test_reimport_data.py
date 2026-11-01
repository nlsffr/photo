import contextlib
import io
import os
import sys
import types
import unittest
from unittest import mock

try:
    import mysql.connector
except ModuleNotFoundError:
    mysql = types.ModuleType("mysql")
    mysql.connector = types.ModuleType("mysql.connector")
    mysql.connector.connect = lambda **kwargs: (_ for _ in ()).throw(AssertionError("no real database in tests"))
    sys.modules["mysql"] = mysql
    sys.modules["mysql.connector"] = mysql.connector

import reimport_data as app


def row(**changes):
    result = dict(media_id="db-id", creator_id="creator-id", handle="alice", source_id="42",
                  url_version=2, photo_hidden=0, creator_hidden=0, photo_removed=None, creator_removed=None)
    result.update(changes)
    return result


class Cursor:
    def __init__(self, rows=None, rowcount=1):
        self.rows = [row()] if rows is None else rows
        self.rowcount = rowcount
        self.updates = []
        self.queries = []
        self.selected_rows = self.rows

    def execute(self, sql, params=()):
        self.queries.append((sql, params))
        if sql.lstrip().startswith("SELECT"):
            selected = list(self.rows)
            if "FROM photos p" in sql:
                if "WHERE BINARY c.handle=BINARY %s" in sql:
                    selected = [row for row in selected if row["handle"] == params[0]]
                if all(guard in sql for guard in ("p.is_hidden=0", "c.is_hidden=0", "p.removed_from_index_at IS NULL", "c.removed_from_index_at IS NULL")):
                    selected = [row for row in selected if not row["photo_hidden"] and not row["creator_hidden"] and row["photo_removed"] is None and row["creator_removed"] is None]
            self.selected_rows = selected[:2]
        if sql.lstrip().startswith("UPDATE"):
            self.updates.append((sql, params))

    def fetchall(self):
        return self.selected_rows

    def close(self):
        pass


class Database:
    def __init__(self, cursor):
        self.test_cursor = cursor
        self.commits = self.rollbacks = self.closes = 0

    def cursor(self, **kwargs):
        return self.test_cursor

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closes += 1


class ReimportTests(unittest.TestCase):
    def test_first_party_media_and_creator_versions_across_seven_locales(self):
        for prefix in ("", "/en", "/fr", "/es", "/de", "/it", "/pt", "/nl"):
            self.assertEqual(app.parse_url(f"https://leakfanhub.com{prefix}/alice/42-v2"), ("alice", "42", 2))
            self.assertEqual(app.parse_url(f"https://leakfanhub.com{prefix}/alice-v3"), ("alice", None, 3))
        self.assertEqual(app.parse_url("/alice/42"), ("alice", "42", 1))

    def test_malformed_foreign_ambiguous_and_reserved_targets_fail_closed(self):
        for url in ("https://evil.example/alice/42", "https://user@leakfanhub.com/alice/42",
                    "/alice/42/extra", "/alice//42", "/api/42", "/fr/en/alice",
                    "/alice/42-v0", "/alice/42-v2147483648", "/alice/42?filter=other", "/alice/42#x",
                    "/alice%2Fother/42", "/alice/42%2F43", "/alice-v3/42", "/", "//evil.example/alice/42"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                app.parse_url(url)

    def test_numeric_source_ids_preserve_all_ascii_digits_up_to_schema_limit(self):
        for source_id in ("0", "00042", "1234567890123456789012345", "9" * 191):
            with self.subTest(source_id=source_id):
                for prefix in ("", "/fr"):
                    target = app.parse_url(f"{prefix}/alice/{source_id}-v2")
                    self.assertEqual(target, ("alice", source_id, 2))
                    cursor = Cursor([row(source_id=source_id)])
                    self.assertEqual(app.process_target(cursor, target)["status"], "would_bump_media")
                    self.assertEqual(cursor.queries[0][1], (source_id,))
                    self.assertEqual(cursor.updates, [])
        for source_id in ("9" * 192, "٤٢", "４２", "²"):
            with self.subTest(source_id=source_id), self.assertRaises(ValueError):
                app.parse_url(f"/alice/{source_id}")

    def test_default_plan_writes_nothing_and_apply_has_atomic_guards(self):
        cursor = Cursor()
        plan = app.process_target(cursor, ("alice", "42", 2))
        self.assertEqual(plan["status"], "would_bump_media")
        self.assertEqual(plan["action"], "dry_run")
        self.assertEqual(cursor.updates, [])
        result = app.process_target(cursor, ("alice", "42", 2), apply=True)
        self.assertEqual(result["status"], "bumped_media")
        self.assertEqual(result["action"], "applied")
        self.assertIn("LIMIT 2", cursor.queries[0][0])
        sql, params = cursor.updates[0]
        for guard in ("p.is_hidden=0", "c.is_hidden=0", "p.removed_from_index_at IS NULL", "c.removed_from_index_at IS NULL", "p.url_version <=>", "p.source_id <=>"):
            self.assertIn(guard, sql)
        self.assertEqual(params[0], 3)
        self.assertNotIn("SET p.source_id", sql)

    def test_replayed_or_stale_urls_never_bump_again(self):
        for current, expected_status in ((3, "already_advanced"), (8, "stale_url"), (1, "stale_url")):
            cursor = Cursor([row(url_version=current)])
            self.assertEqual(app.process_target(cursor, ("alice", "42", 2), apply=True)["status"], expected_status)
            self.assertEqual(cursor.updates, [])

    def test_hidden_removed_ambiguous_and_overflow_rows_never_update(self):
        for changes in (dict(photo_hidden=1), dict(creator_hidden=1), dict(photo_removed="2026-11-01"), dict(creator_removed="2026-11-01"), dict(handle="other"), dict(url_version=2147483647)):
            cursor = Cursor([row(**changes)])
            result = app.process_target(cursor, ("alice", "42", changes.get("url_version", 2)), apply=True)
            self.assertNotEqual(result["status"], "bumped_media")
            self.assertEqual(cursor.updates, [])
        cursor = Cursor([row(), row(media_id="other-id")])
        self.assertEqual(app.process_target(cursor, ("alice", "42", 2), apply=True)["status"], "ambiguous_target")
        self.assertEqual(cursor.updates, [])

    def test_lost_update_is_not_claimed_as_success(self):
        cursor = Cursor(rowcount=0)
        self.assertEqual(app.process_target(cursor, ("alice", "42", 2), apply=True)["status"], "concurrent_change")

    def test_profile_updates_only_its_own_version_and_never_its_media(self):
        cursor = Cursor()
        plan = app.process_target(cursor, ("alice", None, 2))
        self.assertEqual((plan["status"], plan["action"]), ("would_bump_creator", "dry_run"))
        self.assertEqual(cursor.updates, [])
        result = app.process_target(cursor, ("alice", None, 2), apply=True)
        self.assertEqual(result["status"], "bumped_creator")
        self.assertEqual(len(cursor.updates), 1)
        sql, params = cursor.updates[0]
        self.assertIn("UPDATE creators", sql)
        self.assertNotIn("photos", sql)
        self.assertIn("c.is_hidden=0", sql)
        self.assertIn("c.removed_from_index_at IS NULL", sql)
        self.assertIn("c.url_version <=>", sql)
        self.assertEqual(params[0], 3)

    def test_profile_visibility_and_replay_guards_prevent_another_bump(self):
        for changes, status in ((dict(creator_hidden=1), "not_public"), (dict(creator_removed="2026-11-01"), "not_public"), (dict(url_version=3), "already_advanced"), (dict(url_version=8), "stale_url")):
            cursor = Cursor([row(**changes)])
            result = app.process_target(cursor, ("alice", None, 2), apply=True)
            self.assertEqual(result["status"], status)
            self.assertEqual(cursor.updates, [])
            if status == "already_advanced":
                self.assertEqual(result["action"], "noop")

    def test_internal_uuid_cannot_replace_a_numeric_public_source_id(self):
        media_id = "b7dfeceb-2328-43a0-a368-08b34e26fcef"
        cursor = Cursor([row(media_id=media_id, source_id="42")])
        self.assertEqual(app.process_target(cursor, ("alice", media_id, 2), apply=True)["status"], "non_canonical_target")
        self.assertEqual(cursor.updates, [])
        cursor = Cursor([row(media_id=media_id, source_id="external-nonnumeric")])
        self.assertEqual(app.process_target(cursor, ("alice", media_id, 2))["status"], "would_bump_media")

    def test_collection_paths_and_reserved_site_routes_are_not_targets(self):
        for path in ("/alice/photos", "/alice/videos", "/alice/collections", "/fr/alice-v3/photos", "/recherche/42", "/favoris/42", "/favicon.svg", "/alice-v2-v3"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                app.parse_url(path)

    def test_explicit_version_one_aliases_are_not_public_canonical_urls(self):
        for path in ("/alice-v1", "/alice/42-v1", "/fr/alice-v1", "/de/alice/42-v1"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                app.parse_url(path)

    def test_global_active_source_duplicates_are_ambiguous_across_owners(self):
        foreign = row(handle="other", creator_id="other-creator", media_id="other-media")
        cursor = Cursor([row(), foreign])
        self.assertEqual(app.process_target(cursor, ("alice", "42", 2), apply=True)["status"], "ambiguous_target")
        self.assertEqual(cursor.updates, [])
        for exclusion in (dict(photo_hidden=1), dict(creator_hidden=1), dict(photo_removed="removed"), dict(creator_removed="removed")):
            cursor = Cursor([row(), {**foreign, **exclusion}])
            self.assertEqual(app.process_target(cursor, ("alice", "42", 2), apply=True)["status"], "bumped_media")
        cursor = Cursor([foreign])
        self.assertEqual(app.process_target(cursor, ("alice", "42", 2), apply=True)["status"], "not_found")
        self.assertEqual(cursor.updates, [])

    def test_cleanup_failures_cannot_print_connection_details(self):
        database = Database(Cursor())
        database.rollback = mock.Mock(side_effect=RuntimeError("secret-fixture"))
        database.close = mock.Mock(side_effect=RuntimeError("secret-fixture"))
        output = io.StringIO()
        with mock.patch.dict(os.environ, {"DATABASE_URL": "mysql://fixture:secret-fixture@mariadb/catalog"}), mock.patch.object(app, "connect_database", return_value=database), contextlib.redirect_stderr(output):
            self.assertEqual(app.main(["/alice/42-v2"]), 1)
        self.assertNotIn("secret-fixture", output.getvalue())

    def test_existing_database_url_uses_its_network_host_and_decodes_password(self):
        config = app.database_config("mysql://fixture:p%24ss%27word@mariadb:3307/catalog")
        self.assertEqual((config["host"], config["port"], config["database"]), ("mariadb", 3307, "catalog"))
        self.assertEqual(config["password"], "p$ss'word")
        with self.assertRaises(ValueError) as raised:
            app.database_config("mysql://fixture:secret-fixture@mariadb:bad/catalog")
        self.assertNotIn("secret-fixture", str(raised.exception))

    def test_cli_defaults_to_rollback_and_only_commits_a_successful_apply(self):
        for target, flags, commits in (("/alice/42-v2", [], 0), ("/alice/42-v2", ["--apply"], 1), ("/es/alice-v2", [], 0), ("/es/alice-v2", ["--apply"], 1)):
            database = Database(Cursor())
            output = io.StringIO()
            with mock.patch.dict(os.environ, {"DATABASE_URL": "mysql://fixture:secret-fixture@mariadb/catalog"}), mock.patch.object(app, "connect_database", return_value=database, create=True), contextlib.redirect_stdout(output):
                code = app.main([target, *flags])
            self.assertEqual(code, 0)
            self.assertEqual(database.commits, commits)
            self.assertEqual(database.closes, 1)
            self.assertNotIn("secret-fixture", output.getvalue())

    def test_cli_rolls_back_stale_or_concurrent_apply_and_redacts_connector_errors(self):
        for cursor in (Cursor([row(url_version=9)]), Cursor(rowcount=0), Cursor([row(creator_hidden=1)])):
            database = Database(cursor)
            with mock.patch.dict(os.environ, {"DATABASE_URL": "mysql://fixture:secret-fixture@mariadb/catalog"}), mock.patch.object(app, "connect_database", return_value=database), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(app.main(["/alice/42-v2", "--apply"]), 2)
            self.assertEqual(database.commits, 0)
            self.assertEqual(database.rollbacks, 1)
        output = io.StringIO()
        with mock.patch.dict(os.environ, {"DATABASE_URL": "mysql://fixture:secret-fixture@mariadb/catalog"}), mock.patch.object(app, "connect_database", side_effect=RuntimeError("secret-fixture")), contextlib.redirect_stderr(output):
            self.assertEqual(app.main(["/alice/42-v2"]), 1)
        self.assertNotIn("secret-fixture", output.getvalue())


if __name__ == "__main__":
    unittest.main()
