import unittest
from datetime import datetime, timezone

from notification_worker import NotificationWorker, retry_delay_seconds


class FakeStore:
    def __init__(self, event=None):
        self.event = event
        self.calls = []

    def claim_next(self, now):
        self.calls.append(("claim", now))
        event, self.event = self.event, None
        return event

    def mark_delivered(self, event_id, now):
        self.calls.append(("delivered", event_id, now))

    def mark_failed(self, event_id, attempts, error_code, now):
        self.calls.append(("failed", event_id, attempts, error_code, now))


class FakeApi:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    def send_message(self, chat_id, text):
        self.calls.append((chat_id, text))
        if self.fail:
            raise RuntimeError("telegram down token=must-not-be-stored")
        return {"message_id": 1}


class NotificationWorkerTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)
        self.event = {
            "id": "outbox-id",
            "attempts": 1,
            "payload_json": {"text": "Nouveau message support"},
        }

    def test_delivers_a_leased_event_then_marks_it_delivered(self):
        store = FakeStore(self.event)
        api = FakeApi()
        worker = NotificationWorker(
            store, api, admin_chat_id=9988, now=lambda: self.now
        )
        self.assertEqual(worker.run_once(), True)
        self.assertEqual(api.calls, [(9988, "Nouveau message support")])
        self.assertEqual(store.calls[-1], ("delivered", "outbox-id", self.now))

    def test_empty_queue_does_not_call_telegram(self):
        store = FakeStore(None)
        api = FakeApi()
        worker = NotificationWorker(store, api, admin_chat_id=9988, now=lambda: self.now)
        self.assertEqual(worker.run_once(), False)
        self.assertEqual(api.calls, [])

    def test_failure_is_retried_without_storing_the_exception_message(self):
        store = FakeStore(self.event)
        api = FakeApi(fail=True)
        worker = NotificationWorker(store, api, admin_chat_id=9988, now=lambda: self.now)
        self.assertEqual(worker.run_once(), True)
        failed = store.calls[-1]
        self.assertEqual(failed[:3], ("failed", "outbox-id", 1))
        self.assertEqual(failed[3], "RuntimeError")
        self.assertNotIn("token", failed[3])

    def test_retry_backoff_is_bounded_and_terminal_attempts_stay_bounded(self):
        self.assertEqual(retry_delay_seconds(1), 30)
        self.assertEqual(retry_delay_seconds(2), 60)
        self.assertEqual(retry_delay_seconds(7), 1920)
        self.assertEqual(retry_delay_seconds(20), 3600)


if __name__ == "__main__":
    unittest.main()
