from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name("apply-migration.py")
SPEC = importlib.util.spec_from_file_location("apply_migration", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


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


if __name__ == "__main__":
    unittest.main()
