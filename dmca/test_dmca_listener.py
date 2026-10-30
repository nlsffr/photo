import hashlib
from email.message import EmailMessage
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import dmca_listener as listener


def notice():
    msg = EmailMessage()
    msg['From'] = 'sc-noreply@google.com'
    msg['Subject'] = "Notification de Google concernant le contenu soumis à des droits d'auteur"
    msg['Authentication-Results'] = 'mx.google.com; dkim=pass header.i=@google.com; dmarc=pass header.from=google.com'
    msg.set_content(
        "Nous procédons à la suppression du contenu signalé.\n"
        "Étapes suivantes : faites appel, nous pourrons rétablir ces ressources.\n"
        "Les URL mises en cause sont les suivantes :\n"
        "https://leakfanhub.com/example-v3/123-v2\nBesoin d'aide ?\n"
        "Message type: [WNC-594600]\n"
    )
    return msg.as_bytes()


class FakeImap:
    def __init__(self, uids=(11, 12)):
        self.uids = uids
        self.fetched = []
        self.logged_out = False

    def login(self, *_): return "OK", []
    def list(self): return "OK", [b'(\\All) "/" "[Gmail]/All Mail"']
    def select(self, *_, readonly=True):
        assert readonly
        return "OK", [b"2"]

    def uid(self, command, *args):
        if command == "search":
            return "OK", [b" ".join(str(n).encode() for n in self.uids)]
        if command == "fetch":
            assert args[1] == "(BODY.PEEK[])"
            self.fetched.append(int(args[0]))
            return "OK", [(b"message", notice())]
        raise AssertionError(command)

    def logout(self):
        self.logged_out = True


class ListenerTests(unittest.TestCase):
    def test_versioned_media_resolves_with_creator_ownership(self):
        with patch.object(listener, "mysql", return_value='{"kind":"photo","id":"photo-id","is_hidden":0,"removed_at":null}\n') as db:
            targets = listener.resolve_url("https://leakfanhub.com/fr/example-v3/123-v2")
        self.assertEqual(["photo-id"], [t["id"] for t in targets])
        self.assertIn("JOIN creators", db.call_args.args[0])
        self.assertIn(listener.sql_text("example"), db.call_args.args[0])
        self.assertIn(listener.sql_text("123"), db.call_args.args[0])

    def test_ambiguous_handle_requires_review(self):
        rows = '\n'.join(['{"kind":"creator","id":"one"}', '{"kind":"creator","id":"two"}'])
        with patch.object(listener, "mysql", return_value=rows):
            self.assertEqual([], listener.resolve_url("https://leakfanhub.com/example-v3"))

    def test_non_content_urls_do_not_query_database(self):
        with patch.object(listener, "mysql") as db:
            for url in ["https://example.com/example", "https://leakfanhub.com/models", "https://leakfanhub.com/example/123/extra"]:
                self.assertEqual([], listener.resolve_url(url))
        db.assert_not_called()

    def test_removal_hides_and_audits_atomically_without_changing_urls(self):
        decision = type("Decision", (), dict(kind="removal", reason="explicit_removal", urls=("https://leakfanhub.com/example",), case_id=None, notice_id=None))()
        target = {"kind": "creator", "id": "creator-id", "is_hidden": 0, "removed_at": None}
        with patch.object(listener, "mysql", return_value="1\n") as db:
            listener.record_event("a" * 64, 12, decision, [target], [])
        sql = db.call_args.args[0]
        self.assertIn("START TRANSACTION", sql)
        self.assertIn("INSERT INTO dmca_mail_events", sql)
        self.assertIn("is_hidden=1", sql)
        self.assertIn("removed_from_index_at=COALESCE", sql)
        self.assertNotIn("url_version", sql)
        self.assertTrue(sql.index("INSERT INTO") < sql.index("UPDATE creators") < sql.index("COMMIT"))

    def test_unknown_decision_logs_review_without_publication_changes(self):
        decision = type("Decision", (), dict(kind="review", reason="unknown_template", urls=(), case_id=None, notice_id=None))()
        with patch.object(listener, "mysql", return_value="0\n") as db:
            listener.record_event("b" * 64, 15, decision, [], [])
        sql = db.call_args.args[0]
        self.assertNotIn("UPDATE creators", sql)
        self.assertNotIn("UPDATE photos", sql)

    def run_mailbox(self, state, mailbox, **patches):
        from contextlib import ExitStack
        defaults = dict(GMAIL_USER="test@example.invalid", GMAIL_APP_PW="test", UID_STATE_FILE=state)
        with ExitStack() as stack:
            for key, value in defaults.items(): stack.enter_context(patch.object(listener, key, value))
            stack.enter_context(patch.object(listener.imaplib, "IMAP4_SSL", return_value=mailbox))
            stack.enter_context(patch.object(listener, "verify_mailbox_binding"))
            for key, value in patches.items(): stack.enter_context(patch.object(listener, key, **value))
            listener.main()

    def test_database_failure_preserves_cursor_and_logs_out(self):
        with TemporaryDirectory() as temp:
            state = Path(temp) / "uid"; state.write_text("10\n")
            mailbox = FakeImap((11,))
            with self.assertRaisesRegex(RuntimeError, "database unavailable"):
                self.run_mailbox(state, mailbox, ensure_schema={}, known_event_hashes={"return_value": set()}, resolve_url={"return_value": []}, record_event={"side_effect": RuntimeError("database unavailable")})
            self.assertEqual("10\n", state.read_text())
            self.assertTrue(mailbox.logged_out)

    def test_duplicate_mail_not_applied_twice_and_old_uids_not_fetched(self):
        with TemporaryDirectory() as temp:
            state = Path(temp) / "uid"; state.write_text("10\n")
            mailbox = FakeImap((10, 11, 12))
            with patch.object(listener, "record_event") as record:
                self.run_mailbox(state, mailbox, ensure_schema={}, known_event_hashes={"return_value": {hashlib.sha256(notice()).hexdigest()}})
            self.assertEqual([11, 12], mailbox.fetched)
            self.assertEqual("12\n", state.read_text())
            record.assert_not_called()

    def test_dry_run_never_writes_or_advances_cursor(self):
        with TemporaryDirectory() as temp:
            state = Path(temp) / "uid"; state.write_text("10\n")
            with (
                patch.object(listener, "GMAIL_USER", "test@example.invalid"),
                patch.object(listener, "GMAIL_APP_PW", "test"),
                patch.object(listener, "UID_STATE_FILE", state),
                patch.object(listener.imaplib, "IMAP4_SSL", return_value=FakeImap((11,))),
                patch.object(listener, "ensure_schema") as schema,
                patch.object(listener, "record_event") as record,
                patch.object(listener, "resolve_url", return_value=[]),
            ):
                listener.main(dry_run=True)
            self.assertEqual("10\n", state.read_text())
            schema.assert_not_called(); record.assert_not_called()

    def test_missing_cursor_never_replays_history(self):
        with TemporaryDirectory() as temp, patch.object(listener, "UID_STATE_FILE", Path(temp) / "missing"):
            with self.assertRaisesRegex(RuntimeError, "historical notices"):
                listener.load_last_uid()

    def test_mailbox_binding_refuses_folder_or_uidvalidity_changes(self):
        with TemporaryDirectory() as temp, patch.object(listener, "UID_STATE_FILE", Path(temp) / "uid"):
            mailbox = type("Imap", (), {"response": lambda _, key: (key, [b"123"])})()
            listener.verify_mailbox_binding(mailbox, "All Mail", bind=True)
            listener.verify_mailbox_binding(mailbox, "All Mail")
            with self.assertRaisesRegex(RuntimeError, "changed"):
                listener.verify_mailbox_binding(mailbox, "INBOX")
            changed = type("Imap", (), {"response": lambda _, key: (key, [b"124"])})()
            with self.assertRaisesRegex(RuntimeError, "changed"):
                listener.verify_mailbox_binding(changed, "All Mail")


if __name__ == "__main__": unittest.main()
