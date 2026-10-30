import os
import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

os.environ.setdefault("GMAIL_USER", "listener-test@example.invalid")
os.environ.setdefault("GMAIL_APP_PASSWORD", "test-only")
os.environ.setdefault("MARIADB_ROOT_PASSWORD", "test-only")

import dmca_listener


class FakeImap:
    def __init__(self, urls=None, uids=None):
        self.urls = urls or ["https://leakfanhub.com/example-profile"]
        self.uids = uids or list(range(1, len(self.urls) + 1))
        self.uid_fetches = []

    def login(self, _user, _password):
        return "OK", []

    def list(self):
        return "OK", [b'(\\HasNoChildren) "/" "[Gmail]/Tous les messages"']

    def select(self, _mailbox, readonly=True):
        return "OK", [b"1"]

    def search(self, _charset, _query):
        ids = " ".join(str(i) for i in range(1, len(self.urls) + 1))
        return "OK", [ids.encode()]

    def fetch(self, message_id, _query):
        return self._message(self.urls[int(message_id) - 1])

    def uid(self, command, *args):
        if command == "search":
            return "OK", [" ".join(str(uid) for uid in self.uids).encode()]
        if command == "fetch":
            uid = int(args[0])
            self.uid_fetches.append(uid)
            return self._message(self.urls[self.uids.index(uid)])
        raise AssertionError(f"unexpected UID command: {command}")

    @staticmethod
    def _message(url):
        message = (
            "From: sc-noreply@google.com\r\n"
            "Subject: removal notice\r\n"
            "Content-Type: text/plain; charset=utf-8\r\n"
            "\r\n"
            "Les URL mises en cause\n"
            f"{url}\n"
            "Besoin d'aide\n"
        ).encode()
        return "OK", [(b"1 (RFC822)", message)]

    def logout(self):
        return "BYE", []


class ListenerSafetyTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = TemporaryDirectory()
        self.state_file = Path(self.tempdir.name) / "listener.uid"
        self.state_patch = patch.object(
            dmca_listener,
            "UID_STATE_FILE",
            self.state_file,
            create=True,
        )
        self.state_patch.start()

    def tearDown(self):
        self.state_patch.stop()
        self.tempdir.cleanup()

    def test_database_dedup_failure_prevents_url_updates(self):
        updated_urls = []

        def record_update(url):
            updated_urls.append(url)
            return "profile", url, 1

        with (
            patch.object(dmca_listener.imaplib, "IMAP4_SSL", return_value=FakeImap()),
            patch.object(dmca_listener, "mysql", side_effect=RuntimeError("db unavailable")),
            patch.object(dmca_listener, "bump", side_effect=record_update),
        ):
            with self.assertRaisesRegex(RuntimeError, "db unavailable"):
                dmca_listener.main()

        self.assertEqual([], updated_urls)

    def test_known_notice_hashes_are_loaded_with_one_database_query(self):
        urls = [
            "https://leakfanhub.com/profile-one",
            "https://leakfanhub.com/profile-two",
        ]
        known_hashes = [hashlib.sha256(url.encode()).hexdigest() for url in urls]
        queries = []

        def database(sql):
            queries.append(sql)
            if "SELECT urls_hash" in sql:
                return "\n".join(known_hashes) + "\n"
            if "SELECT COUNT(*)" in sql:
                return "1\n"
            raise AssertionError(f"unexpected write: {sql}")

        with (
            patch.object(dmca_listener.imaplib, "IMAP4_SSL", return_value=FakeImap(urls)),
            patch.object(dmca_listener, "mysql", side_effect=database),
        ):
            dmca_listener.main()

        self.assertEqual(1, len(queries))
        self.assertIn("SELECT urls_hash", queries[0])

    def test_uid_cursor_skips_old_messages_and_advances_after_success(self):
        urls = [
            "https://leakfanhub.com/profile-eleven",
            "https://leakfanhub.com/profile-twelve",
        ]
        mailbox = FakeImap(urls, uids=[11, 12])
        known_hashes = [hashlib.sha256(url.encode()).hexdigest() for url in urls]
        self.state_file.write_text("10\n", encoding="ascii")

        with (
            patch.object(dmca_listener.imaplib, "IMAP4_SSL", return_value=mailbox),
            patch.object(
                dmca_listener,
                "mysql",
                return_value="\n".join(known_hashes) + "\n",
            ),
        ):
            dmca_listener.main()

        self.assertEqual([11, 12], mailbox.uid_fetches)
        self.assertEqual("12", self.state_file.read_text(encoding="ascii").strip())

    def test_uid_cursor_ignores_server_result_at_or_below_saved_uid(self):
        mailbox = FakeImap(["https://leakfanhub.com/profile-ten"], uids=[10])
        self.state_file.write_text("10\n", encoding="ascii")

        with (
            patch.object(dmca_listener.imaplib, "IMAP4_SSL", return_value=mailbox),
            patch.object(dmca_listener, "mysql", return_value=""),
        ):
            dmca_listener.main()

        self.assertEqual([], mailbox.uid_fetches)
        self.assertEqual("10", self.state_file.read_text(encoding="ascii").strip())


if __name__ == "__main__":
    unittest.main()
