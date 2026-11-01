"""Pure guard checks: no mysql import and no network connection."""

import unittest

from integration_reimport_data import IsolationError, TemporarySandbox, validate_statement


class ProofCursor:
    def __init__(self, connection):
        self.connection = connection
        self.table = None

    def execute(self, sql, params=()):
        self.connection.statements.append(sql)
        if not sql.startswith("SHOW CREATE TABLE"):
            raise AssertionError("candidate statement reached an unverified fixture")
        self.table = sql.split("`")[1]

    def fetchone(self):
        return {"Create Table": self.connection.definitions[self.table]}

    def close(self):
        pass


class ProofConnection:
    def __init__(self):
        self.statements = []
        self.definitions = {table: f"CREATE TEMPORARY TABLE `{table}` (id int)" for table in ("creators", "photos")}

    def cursor(self, **kwargs):
        return ProofCursor(self)


class IsolationTests(unittest.TestCase):
    def test_both_creations_are_required_before_any_statement(self):
        for created in (set(), {"creators"}, {"photos"}):
            connection = ProofConnection()
            sandbox = TemporarySandbox(connection)
            sandbox.created = created
            with self.assertRaises(IsolationError):
                sandbox.cursor()
            self.assertEqual(connection.statements, [])

    def test_either_persistent_table_marker_blocks_candidate_access(self):
        for table in ("creators", "photos"):
            connection = ProofConnection()
            connection.definitions[table] = f"CREATE TABLE `{table}` (id int)"
            sandbox = TemporarySandbox(connection)
            sandbox.created = {"creators", "photos"}
            with self.assertRaises(IsolationError):
                sandbox.cursor()
            self.assertTrue(all(sql.startswith("SHOW CREATE TABLE") for sql in connection.statements))

    def test_only_the_expected_tables_and_read_update_statements_are_allowed(self):
        connection = ProofConnection()
        sandbox = TemporarySandbox(connection)
        sandbox.created = {"creators", "photos"}
        cursor = sandbox.cursor()
        for sql in (
            "UPDATE production.photos SET url_version=2", "DROP TABLE photos",
            "DELETE FROM photos", "UPDATE photos p,users u SET p.url_version=2",
            "UPDATE photos SET url_version=2; UPDATE users SET id=1",
            "SELECT * FROM users", "SELECT * INTO OUTFILE 'x' FROM photos",
        ):
            with self.subTest(sql=sql), self.assertRaises(IsolationError):
                cursor.execute(sql)
        self.assertTrue(all(sql.startswith("SHOW CREATE TABLE") for sql in connection.statements))
        cursor.close()

    def test_expected_joined_update_passes_syntax_guard(self):
        validate_statement("UPDATE photos p JOIN creators c ON c.id=p.creator_id SET p.url_version=%s WHERE p.id=%s")


if __name__ == "__main__":
    unittest.main()
