import hashlib
import unittest
from datetime import datetime, timedelta, timezone

from telegram_premium_worker import PaymentWorker, extension_window


TOKEN = "A" * 43
ORDER_ID = "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e"
PAYLOAD = f"lfh:{ORDER_ID}"


class FakeApi:
    def __init__(self):
        self.calls = []

    def send_invoice(self, **kwargs):
        self.calls.append(("send_invoice", kwargs))
        return {"message_id": 77}

    def answer_pre_checkout(self, query_id, ok, error_message=None):
        self.calls.append(
            (
                "answer_pre_checkout",
                {"query_id": query_id, "ok": ok, "error_message": error_message},
            )
        )
        return True

    def send_message(self, chat_id, text):
        self.calls.append(("send_message", {"chat_id": chat_id, "text": text}))
        return {"message_id": 88}


class FakeStore:
    def __init__(self):
        self.calls = []
        self.claim = {
            "id": ORDER_ID,
            "plan": "week",
            "stars_amount": 550,
            "invoice_payload": PAYLOAD,
            "launch_expires_at": datetime(2026, 10, 29, 12, 30),
            "telegram_user_id": 1234,
            "status": "claimed",
        }
        self.precheckout = {**self.claim, "currency": "XTR", "status": "invoice_sent"}
        self.activation = "activated"
        self.refund = "refunded"

    def claim_launch_token(self, token_hash, telegram_user_id, chat_id, now):
        self.calls.append(
            ("claim", token_hash, telegram_user_id, chat_id, now)
        )
        return self.claim

    def mark_invoice_sent(self, order_id, now):
        self.calls.append(("invoice_sent", order_id, now))

    def get_precheckout_order(self, payload):
        self.calls.append(("precheckout_order", payload))
        return self.precheckout

    def mark_precheckout_approved(self, order_id, now):
        self.calls.append(("precheckout_approved", order_id, now))

    def activate_payment(self, update_id, telegram_user_id, payment, now):
        self.calls.append(
            ("activate", update_id, telegram_user_id, payment, now)
        )
        return self.activation

    def record_refund(self, update_id, telegram_user_id, refund, now):
        self.calls.append(("refund", update_id, telegram_user_id, refund, now))
        return self.refund

    def save_offset(self, update_id):
        self.calls.append(("offset", update_id))


class TelegramPremiumWorkerTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)
        self.store = FakeStore()
        self.api = FakeApi()
        self.worker = PaymentWorker(
            self.store, self.api, now=lambda: self.now, site_url="https://leakfanhub.com"
        )

    def test_start_claims_hash_and_sends_exact_one_line_xtr_invoice(self):
        update = {
            "update_id": 10,
            "message": {
                "chat": {"id": 5678},
                "from": {"id": 1234},
                "text": f"/start p_{TOKEN}",
            },
        }

        self.worker.handle_update(update)

        claim = self.store.calls[0]
        self.assertEqual(claim[0], "claim")
        self.assertEqual(claim[1], hashlib.sha256(TOKEN.encode()).hexdigest())
        method, invoice = self.api.calls[0]
        self.assertEqual(method, "send_invoice")
        self.assertEqual(invoice["currency"], "XTR")
        self.assertEqual(invoice["prices"], [{"label": "Premium 1 semaine", "amount": 550}])
        self.assertEqual(invoice["payload"], PAYLOAD)
        self.assertEqual(invoice["start_parameter"], f"p_{TOKEN}")
        self.assertNotIn("provider_token", invoice)
        self.assertEqual(self.store.calls[-1][0], "invoice_sent")

    def test_precheckout_is_approved_only_for_exact_bound_order(self):
        query = {
            "id": "pc-1",
            "from": {"id": 1234},
            "currency": "XTR",
            "total_amount": 550,
            "invoice_payload": PAYLOAD,
        }
        self.worker.handle_update({"update_id": 11, "pre_checkout_query": query})
        self.assertEqual(
            self.api.calls[-1],
            (
                "answer_pre_checkout",
                {"query_id": "pc-1", "ok": True, "error_message": None},
            ),
        )
        self.assertEqual(self.store.calls[-1][0], "precheckout_approved")

        self.api.calls.clear()
        query["total_amount"] = 549
        self.worker.handle_update({"update_id": 12, "pre_checkout_query": query})
        self.assertEqual(self.api.calls[-1][1]["ok"], False)
        self.assertIn("montant", self.api.calls[-1][1]["error_message"].lower())

    def test_precheckout_rejects_quickly_when_order_verification_is_unavailable(self):
        def fail(_payload):
            raise RuntimeError("database unavailable")

        self.store.get_precheckout_order = fail
        self.worker.handle_update(
            {
                "update_id": 121,
                "pre_checkout_query": {
                    "id": "pc-db",
                    "from": {"id": 1234},
                    "currency": "XTR",
                    "total_amount": 550,
                    "invoice_payload": PAYLOAD,
                },
            }
        )
        self.assertEqual(self.api.calls[-1][0], "answer_pre_checkout")
        self.assertEqual(self.api.calls[-1][1]["ok"], False)
        self.assertIn("vérification", self.api.calls[-1][1]["error_message"].lower())

    def test_successful_payment_activates_only_after_the_payment_update(self):
        payment = {
            "currency": "XTR",
            "total_amount": 550,
            "invoice_payload": PAYLOAD,
            "telegram_payment_charge_id": "tg-charge-1",
            "provider_payment_charge_id": "",
        }
        update = {
            "update_id": 13,
            "message": {
                "chat": {"id": 5678},
                "from": {"id": 1234},
                "successful_payment": payment,
            },
        }
        self.worker.handle_update(update)

        activation = next(call for call in self.store.calls if call[0] == "activate")
        self.assertEqual(activation[1:4], (13, 1234, payment))
        self.assertEqual(self.api.calls[-1][0], "send_message")
        self.assertIn("activé", self.api.calls[-1][1]["text"])

    def test_duplicate_payment_does_not_send_a_second_activation_message(self):
        self.store.activation = "duplicate"
        self.worker.handle_update(
            {
                "update_id": 14,
                "message": {
                    "chat": {"id": 5678},
                    "from": {"id": 1234},
                    "successful_payment": {
                        "currency": "XTR",
                        "total_amount": 550,
                        "invoice_payload": PAYLOAD,
                        "telegram_payment_charge_id": "tg-charge-1",
                    },
                },
            }
        )
        self.assertEqual(self.api.calls, [])

    def test_refunded_payment_is_bookkept(self):
        refund = {
            "currency": "XTR",
            "total_amount": 550,
            "invoice_payload": PAYLOAD,
            "telegram_payment_charge_id": "tg-charge-1",
        }
        self.worker.handle_update(
            {
                "update_id": 15,
                "message": {
                    "chat": {"id": 5678},
                    "from": {"id": 1234},
                    "refunded_payment": refund,
                },
            }
        )
        self.assertEqual(self.store.calls[-1][0], "refund")

    def test_terms_and_payment_support_commands_have_real_destinations(self):
        for command in ("/terms", "/support", "/paysupport"):
            self.worker.handle_update(
                {
                    "update_id": 20,
                    "message": {
                        "chat": {"id": 5678},
                        "from": {"id": 1234},
                        "text": command,
                    },
                }
            )
        texts = [call[1]["text"] for call in self.api.calls]
        self.assertIn("https://leakfanhub.com/conditions", texts[0])
        self.assertIn("https://leakfanhub.com/contact/support", texts[1])
        self.assertIn("https://leakfanhub.com/contact/support", texts[2])

    def test_batch_persists_offset_only_after_each_successful_update(self):
        updates = [
            {
                "update_id": 30,
                "message": {"chat": {"id": 1}, "from": {"id": 1}, "text": "/terms"},
            },
            {
                "update_id": 31,
                "message": {"chat": {"id": 1}, "from": {"id": 1}, "text": "/support"},
            },
        ]
        self.worker.process_batch(updates)
        offsets = [call[1] for call in self.store.calls if call[0] == "offset"]
        self.assertEqual(offsets, [30, 31])

    def test_batch_stops_before_acknowledging_a_failed_update(self):
        def fail(*_args, **_kwargs):
            raise RuntimeError("db unavailable")

        self.store.activate_payment = fail
        updates = [
            {
                "update_id": 40,
                "message": {
                    "chat": {"id": 1},
                    "from": {"id": 1},
                    "successful_payment": {
                        "currency": "XTR",
                        "total_amount": 550,
                        "invoice_payload": PAYLOAD,
                        "telegram_payment_charge_id": "charge",
                    },
                },
            }
        ]
        with self.assertRaisesRegex(RuntimeError, "db unavailable"):
            self.worker.process_batch(updates)
        self.assertFalse(any(call[0] == "offset" for call in self.store.calls))

    def test_renewal_extends_from_the_later_of_now_or_active_end(self):
        active_end = self.now + timedelta(days=4)
        start, end = extension_window(self.now, active_end, 7)
        self.assertEqual(start, active_end)
        self.assertEqual(end, active_end + timedelta(days=7))

        expired_end = self.now - timedelta(days=1)
        start, end = extension_window(self.now, expired_end, 30)
        self.assertEqual(start, self.now)
        self.assertEqual(end, self.now + timedelta(days=30))


if __name__ == "__main__":
    unittest.main()
