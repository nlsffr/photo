from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import importlib.util
import os
from pathlib import Path
import runpy
import tempfile
from threading import Event
import unittest
from urllib.parse import urlsplit


MODULE_PATH = Path(__file__).with_name("apply-migration.py")
SPEC = importlib.util.spec_from_file_location("apply_migration", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
CAP_MIGRATION = MODULE_PATH.parent.parent / "migrations" / "028-creator-import-caps.sql"
STAGING_MIGRATION = CAP_MIGRATION.with_name("029-creator-bootstrap-staging.sql")


class ApplyMigrationTests(unittest.TestCase):
    def test_splits_regular_statements_and_delimiter_trigger(self) -> None:
        source = """
SET CHARACTER SET utf8mb4;
DELIMITER $$
CREATE TRIGGER example BEFORE UPDATE ON photos
FOR EACH ROW
BEGIN
  SET NEW.views_count = COALESCE(NEW.views_count, 0);
END$$
DELIMITER ;
CREATE INDEX IF NOT EXISTS idx_example ON photos (created_at);
"""
        statements = list(MODULE.split_mysql_script(source))
        self.assertEqual(len(statements), 3)
        self.assertIn("CREATE TRIGGER example", statements[1])
        self.assertIn("SET NEW.views_count", statements[1])

    def test_rejects_unfinished_input(self) -> None:
        with self.assertRaises(ValueError):
            list(MODULE.split_mysql_script("SELECT 1"))

    def test_splits_creator_cap_migration_into_five_statements(self) -> None:
        statements = list(MODULE.split_mysql_script(CAP_MIGRATION.read_text("utf-8")))
        self.assertEqual(len(statements), 5)
        self.assertIn("CREATE TABLE IF NOT EXISTS creator_import_caps", statements[2])
        for trigger, event in zip(statements[3:], ("AFTER INSERT", "AFTER UPDATE")):
            self.assertIn(event + " ON photos", trigger)
            self.assertIn("FOR UPDATE", trigger)
            self.assertIn("SIGNAL SQLSTATE '45000'", trigger)

    def test_splits_bootstrap_stage_migration_into_six_statements(self) -> None:
        statements = list(MODULE.split_mysql_script(STAGING_MIGRATION.read_text("utf-8")))
        self.assertEqual(len(statements), 6)
        self.assertIn("REFERENCES creator_import_caps", statements[2])
        self.assertIn("REFERENCES creator_bootstrap_staging", statements[3])
        for trigger, table in zip(statements[4:], ("creators", "photos")):
            self.assertIn(f"AFTER UPDATE ON {table}", trigger)
            self.assertIn("IF OLD.is_hidden = 1", trigger)

    def test_database_url_is_parsed_without_returning_the_url(self) -> None:
        config = MODULE.database_config(
            "mysql://user:p%40ss@mariadb:3306/leakfanhub", "127.0.0.1"
        )
        self.assertEqual(config["host"], "127.0.0.1")
        self.assertEqual(config["user"], "user")
        self.assertEqual(config["password"], "p@ss")
        self.assertEqual(config["database"], "leakfanhub")

    def test_later_env_file_wins_without_shell_expansion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory, "first.env")
            second = Path(directory, "second.env")
            first.write_text("DATABASE_URL=mysql://old:p@db/old\n", "utf-8")
            second.write_text(
                "export DATABASE_URL='mysql://new:p%24word@db/current'\n", "utf-8"
            )

            value = MODULE.env_value([first, second], "DATABASE_URL")
            self.assertEqual(value, "mysql://new:p%24word@db/current")


@unittest.skipUnless(os.environ.get("MEGABOT_CAP_TEST_DATABASE_URL"), "requires a disposable MariaDB database")
class CreatorCapMariaDbTests(unittest.TestCase):
    def test_stage_map_lifecycle_preserves_hidden_only_and_explicit_removals(self) -> None:
        import mysql.connector

        url = os.environ["MEGABOT_CAP_TEST_DATABASE_URL"]
        config = MODULE.database_config(url, urlsplit(url).hostname)
        if not config["database"].startswith("megabot_cap_test_"):
            self.fail("expected a disposable megabot_cap_test_* database")
        config["autocommit"] = True
        connection = mysql.connector.connect(**config)
        self.addCleanup(connection.close)
        cursor = connection.cursor()
        self.addCleanup(cursor.close)
        cursor.execute("SHOW TABLES")
        self.assertEqual(cursor.fetchall(), [], "disposable database must be empty")

        def clear_fixture():
            if connection.in_transaction:
                connection.rollback()
            for table in ("creator_bootstrap_staged_media", "creator_bootstrap_staging",
                          "photos", "creator_import_caps", "creators"):
                cursor.execute("DROP TABLE IF EXISTS " + table)

        self.addCleanup(clear_fixture)
        engine = " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        cursor.execute("CREATE TABLE creators (id CHAR(36) PRIMARY KEY, handle VARCHAR(100), "
                       "is_hidden BOOLEAN NOT NULL, removed_from_index_at DATETIME NULL, "
                       "avatar_url VARCHAR(500), cover_url VARCHAR(500))" + engine)
        cursor.execute("CREATE TABLE photos (id CHAR(36) PRIMARY KEY, creator_id CHAR(36) NOT NULL, "
                       "is_hidden BOOLEAN NOT NULL, removed_from_index_at DATETIME NULL, "
                       "image_url VARCHAR(500), video_url VARCHAR(500), "
                       "FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE)" + engine)
        for migration in (CAP_MIGRATION, STAGING_MIGRATION, STAGING_MIGRATION):
            for statement in MODULE.split_mysql_script(migration.read_text("utf-8")):
                cursor.execute(statement)

        operator = runpy.run_path(str(MODULE_PATH.with_name("refresh-removed-media-map.py")))

        def current_map():
            cursor.execute(operator["CREATOR_QUERY"])
            return operator["_split_tombstones"](cursor.fetchall(), set())

        def reserve(handle):
            cursor.execute("INSERT INTO creators (id,handle,is_hidden) VALUES (%s,%s,1)", (handle, handle))
            cursor.execute("INSERT INTO creator_import_caps (creator_id) VALUES (%s)", (handle,))
            cursor.execute("INSERT INTO creator_bootstrap_staging VALUES (%s)", (handle,))

        def stage_photo(handle, photo):
            cursor.execute("INSERT INTO photos (id,creator_id,is_hidden,image_url) VALUES (%s,%s,0,%s)",
                           (photo, handle, f"/media/{photo}.jpg"))
            cursor.execute("UPDATE photos SET is_hidden=1 WHERE id=%s", (photo,))
            cursor.execute("INSERT INTO creator_bootstrap_staged_media VALUES (%s,%s)", (photo, handle))

        reserve("working")
        stage_photo("working", "first")
        stage_photo("working", "second")
        cursor.execute("INSERT INTO creators (id,handle,is_hidden) VALUES ('legacy','legacy',1)")
        self.assertEqual(current_map(), ({"legacy"}, set(), {"working"}, {"/media/first.jpg", "/media/second.jpg"}))

        # No-op legal hides must invalidate the transient marker even when the
        # row was already hidden for staging.
        cursor.execute("UPDATE photos SET is_hidden=1 WHERE id='first'")
        self.assertEqual(current_map(), ({"legacy"}, {"/media/first.jpg"}, {"working"}, {"/media/second.jpg"}))
        cursor.execute("UPDATE creators SET is_hidden=1 WHERE id='working'")
        self.assertEqual(current_map(), ({"legacy", "working"}, {"/media/first.jpg", "/media/second.jpg"}, set(), set()))

        reserve("publishable")
        stage_photo("publishable", "third")
        connection.start_transaction()
        cursor.execute("UPDATE photos SET is_hidden=0 WHERE id='third'")
        cursor.execute("UPDATE creators SET is_hidden=0 WHERE id='publishable'")
        connection.rollback()
        self.assertEqual(current_map()[2:], ({"publishable"}, {"/media/third.jpg"}))
        connection.start_transaction()
        cursor.execute("UPDATE photos SET is_hidden=0 WHERE id='third'")
        cursor.execute("UPDATE creators SET is_hidden=0 WHERE id='publishable'")
        connection.commit()
        self.assertEqual(current_map()[2:], (set(), set()))
        cursor.execute("SELECT COUNT(*) FROM creator_bootstrap_staging WHERE creator_id='publishable'")
        self.assertEqual(cursor.fetchall(), [(0,)])

        reserve("withdrawn")
        stage_photo("withdrawn", "fourth")
        cursor.execute("UPDATE photos SET removed_from_index_at=NOW() WHERE id='fourth'")
        self.assertIn("/media/fourth.jpg", current_map()[1])
        cursor.execute("UPDATE creators SET removed_from_index_at=NOW() WHERE id='withdrawn'")
        self.assertIn("withdrawn", current_map()[0])
        self.assertEqual(current_map()[2:], (set(), set()))

    def test_concurrent_last_slot_and_lifetime_cap(self) -> None:
        import mysql.connector

        url = os.environ["MEGABOT_CAP_TEST_DATABASE_URL"]
        config = MODULE.database_config(url, urlsplit(url).hostname)
        if not config["database"].startswith("megabot_cap_test_"):
            self.fail("expected a disposable megabot_cap_test_* database")
        config["autocommit"] = True
        connection = mysql.connector.connect(**config)
        self.addCleanup(connection.close)
        cursor = connection.cursor()
        self.addCleanup(cursor.close)
        cursor.execute("SHOW TABLES")
        self.assertEqual(cursor.fetchall(), [], "disposable database must be empty")

        def clear_fixture():
            if connection.in_transaction:
                connection.rollback()
            for table in ("photos", "creator_import_caps", "test_stats", "creators"):
                cursor.execute("DROP TABLE IF EXISTS " + table)

        self.addCleanup(clear_fixture)
        cursor.execute("CREATE TABLE creators (id CHAR(36) PRIMARY KEY) "
                       "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
        cursor.execute("CREATE TABLE photos (id INT PRIMARY KEY, creator_id CHAR(36) NOT NULL, "
                       "is_hidden BOOLEAN NOT NULL DEFAULT 0, "
                       "FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE) "
                       "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci")
        cursor.execute("CREATE TABLE test_stats (id INT PRIMARY KEY) ENGINE=InnoDB")
        cursor.execute("CREATE TRIGGER test_stats_ai AFTER INSERT ON photos FOR EACH ROW "
                       "INSERT INTO test_stats (id) VALUES (NEW.id)")
        for _ in range(2):
            for statement in MODULE.split_mysql_script(CAP_MIGRATION.read_text("utf-8")):
                cursor.execute(statement)

        cursor.execute("INSERT INTO creators VALUES ('capped'), ('existing')")
        cursor.execute("INSERT INTO creator_import_caps (creator_id) VALUES ('capped')")
        cursor.executemany("INSERT INTO photos (id, creator_id) VALUES (%s, 'existing')",
                           [(i,) for i in range(101, 118)])
        cursor.executemany("INSERT INTO photos (id, creator_id) VALUES (%s, 'capped')",
                           [(i,) for i in range(1, 15)])
        cursor.execute("INSERT INTO photos (id, creator_id) VALUES (1, 'capped') "
                       "ON DUPLICATE KEY UPDATE is_hidden=1")
        cursor.execute("SELECT admitted FROM creator_import_caps")
        self.assertEqual(cursor.fetchall(), [(14,)])

        connection.start_transaction()
        cursor.execute("INSERT INTO photos (id, creator_id) VALUES (15, 'capped')")
        connection.rollback()
        cursor.execute("SELECT admitted FROM creator_import_caps")
        self.assertEqual(cursor.fetchall(), [(14,)])

        started = Event()

        def competing_insert():
            with mysql.connector.connect(**config) as other, other.cursor() as concurrent:
                concurrent.execute("SET SESSION innodb_lock_wait_timeout=5")
                started.set()
                try:
                    concurrent.execute("INSERT INTO photos (id, creator_id) VALUES (16, 'capped')")
                except mysql.connector.Error as error:
                    return error.sqlstate, error.msg
                return None

        connection.start_transaction()
        cursor.execute("INSERT INTO photos (id, creator_id) VALUES (15, 'capped')")
        with ThreadPoolExecutor(max_workers=1) as executor:
            result = executor.submit(competing_insert)
            try:
                self.assertTrue(started.wait(5))
                with self.assertRaises(TimeoutError):
                    result.result(timeout=0.2)
            finally:
                connection.commit()
            self.assertEqual(result.result(timeout=6), ("45000", "creator_import_cap_reached"))

        cursor.execute("SELECT admitted FROM creator_import_caps")
        self.assertEqual(cursor.fetchall(), [(15,)])
        cursor.execute("SELECT COUNT(*) FROM photos WHERE creator_id='capped'")
        self.assertEqual(cursor.fetchall(), [(15,)])
        cursor.execute("SELECT COUNT(*) FROM test_stats WHERE id=16")
        self.assertEqual(cursor.fetchall(), [(0,)])
        with self.assertRaises(mysql.connector.Error) as move:
            cursor.execute("UPDATE photos SET creator_id='capped' WHERE id=101")
        self.assertEqual(move.exception.sqlstate, "45000")
        cursor.execute("SELECT creator_id FROM photos WHERE id=101")
        self.assertEqual(cursor.fetchall(), [("existing",)])
        cursor.execute("UPDATE photos SET is_hidden=1 WHERE id=15")
        cursor.execute("DELETE FROM photos WHERE id=15")
        with self.assertRaises(mysql.connector.Error) as later:
            cursor.execute("INSERT INTO photos (id, creator_id) VALUES (17, 'capped')")
        self.assertEqual(later.exception.sqlstate, "45000")
        cursor.execute("DELETE FROM creators WHERE id='capped'")
        cursor.execute("SELECT COUNT(*) FROM creator_import_caps")
        self.assertEqual(cursor.fetchall(), [(0,)])


if __name__ == "__main__":
    unittest.main()
