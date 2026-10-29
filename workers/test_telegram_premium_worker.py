import hashlib
import unittest
from datetime import datetime, timedelta, timezone

import telegram_premium_worker as worker_module
from telegram_premium_worker import MariaPaymentStore, PaymentWorker, extension_window


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

    def quarantine_update(self, update_id, update_kind, error_code, charge_id, now):
        self.calls.append(
            ("quarantine", update_id, update_kind, error_code, charge_id, now)
        )


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

    def test_replaying_the_same_start_token_never_sends_a_second_invoice(self):
        claims = [self.store.claim, None]

        def claim_once(*_args):
            return claims.pop(0)

        self.store.claim_launch_token = claim_once
        update = {
            "update_id": 101,
            "message": {
                "chat": {"id": 5678},
                "from": {"id": 1234},
                "text": f"/start p_{TOKEN}",
            },
        }

        self.worker.handle_update(update)
        update["update_id"] = 102
        self.worker.handle_update(update)

        invoices = [call for call in self.api.calls if call[0] == "send_invoice"]
        self.assertEqual(len(invoices), 1)

    def test_only_a_pending_order_can_claim_a_launch_token(self):
        self.assertTrue(worker_module.is_claimable_order_status("pending"))
        for status in ("claimed", "invoice_sent", "paid", "refunded", "failed", "expired"):
            with self.subTest(status=status):
                self.assertFalse(worker_module.is_claimable_order_status(status))

    def test_store_rejects_a_replayed_claimed_token_without_mutating_the_order(self):
        class Cursor:
            def __init__(self):
                self.queries = []

            def execute(self, query, params):
                self.queries.append((query, params))

            def fetchone(self):
                return {
                    "id": ORDER_ID,
                    "plan": "week",
                    "stars_amount": 550,
                    "status": "claimed",
                    "launch_expires_at": self_now + timedelta(minutes=20),
                    "telegram_user_id": 1234,
                    "invoice_payload": PAYLOAD,
                }

        class Connection:
            def __init__(self):
                self.db_cursor = Cursor()

            def start_transaction(self):
                pass

            def cursor(self, **_kwargs):
                return self.db_cursor

            def commit(self):
                pass

            def rollback(self):
                pass

            def close(self):
                pass

        self_now = self.now
        connection = Connection()
        store = MariaPaymentStore(
            "mysql://user:pass@mariadb:3306/lumengallery",
            connection_factory=lambda **_kwargs: connection,
        )

        claimed = store.claim_launch_token("hash", 1234, 5678, self.now)

        self.assertIsNone(claimed)
        self.assertFalse(
            any(query.lstrip().startswith("UPDATE") for query, _ in connection.db_cursor.queries)
        )

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

    def test_permanent_payment_error_is_quarantined_and_does_not_poison_queue(self):
        def reject(*_args, **_kwargs):
            raise ValueError("order_not_payable")

        self.store.activate_payment = reject
        updates = [
            {
                "update_id": 41,
                "message": {
                    "chat": {"id": 1},
                    "from": {"id": 1},
                    "successful_payment": {
                        "currency": "XTR",
                        "total_amount": 550,
                        "invoice_payload": PAYLOAD,
                        "telegram_payment_charge_id": "charge-2",
                    },
                },
            },
            {
                "update_id": 42,
                "message": {
                    "chat": {"id": 1},
                    "from": {"id": 1},
                    "text": "/terms",
                },
            },
        ]

        self.worker.process_batch(updates)

        quarantined = [call for call in self.store.calls if call[0] == "quarantine"]
        self.assertEqual(quarantined[0][1:5], (41, "successful_payment", "order_not_payable", "charge-2"))
        offsets = [call[1] for call in self.store.calls if call[0] == "offset"]
        self.assertEqual(offsets, [41, 42])

    def test_precheckout_is_answered_before_slower_earlier_updates_in_the_batch(self):
        updates = [
            {
                "update_id": 50,
                "message": {
                    "chat": {"id": 1},
                    "from": {"id": 1},
                    "text": "/terms",
                },
            },
            {
                "update_id": 51,
                "pre_checkout_query": {
                    "id": "pc-priority",
                    "from": {"id": 1234},
                    "currency": "XTR",
                    "total_amount": 550,
                    "invoice_payload": PAYLOAD,
                },
            },
        ]

        self.worker.process_batch(updates)

        self.assertEqual(self.api.calls[0][0], "answer_pre_checkout")
        self.assertEqual(
            [call[1] for call in self.store.calls if call[0] == "offset"],
            [50, 51],
        )

    def test_audit_write_failure_after_precheckout_answer_does_not_block_offset(self):
        def fail_audit(*_args):
            raise RuntimeError("db unavailable after answer")

        self.store.mark_precheckout_approved = fail_audit
        update = {
            "update_id": 52,
            "pre_checkout_query": {
                "id": "pc-audit",
                "from": {"id": 1234},
                "currency": "XTR",
                "total_amount": 550,
                "invoice_payload": PAYLOAD,
            },
        }

        self.worker.process_batch([update])

        self.assertEqual(self.api.calls[0][0], "answer_pre_checkout")
        self.assertIn(("offset", 52), self.store.calls)

    def test_renewal_extends_from_the_later_of_now_or_active_end(self):
        active_end = self.now + timedelta(days=4)
        start, end = extension_window(self.now, active_end, 7)
        self.assertEqual(start, active_end)
        self.assertEqual(end, active_end + timedelta(days=7))

        expired_end = self.now - timedelta(days=1)
        start, end = extension_window(self.now, expired_end, 30)
        self.assertEqual(start, self.now)
        self.assertEqual(end, self.now + timedelta(days=30))

    def test_refund_removes_only_the_unconsumed_grant_and_preserves_later_time(self):
        now = datetime(2026, 10, 2, tzinfo=timezone.utc)
        current_end = datetime(2026, 10, 15, tzinfo=timezone.utc)
        grants = [
            {
                "telegram_payment_charge_id": "charge-a",
                "entitlement_start": datetime(2026, 10, 1, tzinfo=timezone.utc),
                "entitlement_end": datetime(2026, 10, 8, tzinfo=timezone.utc),
            },
            {
                "telegram_payment_charge_id": "charge-b",
                "entitlement_start": datetime(2026, 10, 8, tzinfo=timezone.utc),
                "entitlement_end": datetime(2026, 10, 15, tzinfo=timezone.utc),
            },
        ]

        adjusted = worker_module.refund_adjusted_end(
            now,
            current_end,
            datetime(2026, 10, 1, tzinfo=timezone.utc),
            grants,
            "charge-a",
        )

        self.assertEqual(adjusted, datetime(2026, 10, 9, tzinfo=timezone.utc))

    def test_second_refund_after_an_older_refund_still_preserves_later_grants(self):
        # A was already refunded at day 2, shifting B and C seven days earlier.
        now = datetime(2026, 10, 3, tzinfo=timezone.utc)
        current_end = datetime(2026, 10, 16, tzinfo=timezone.utc)
        active_grants = [
            {
                "telegram_payment_charge_id": "charge-b",
                "entitlement_start": datetime(2026, 10, 8, tzinfo=timezone.utc),
                "entitlement_end": datetime(2026, 10, 15, tzinfo=timezone.utc),
            },
            {
                "telegram_payment_charge_id": "charge-c",
                "entitlement_start": datetime(2026, 10, 15, tzinfo=timezone.utc),
                "entitlement_end": datetime(2026, 10, 22, tzinfo=timezone.utc),
            },
        ]

        adjusted = worker_module.refund_adjusted_end(
            now,
            current_end,
            datetime(2026, 10, 1, tzinfo=timezone.utc),
            active_grants,
            "charge-b",
        )

        self.assertEqual(adjusted, datetime(2026, 10, 10, tzinfo=timezone.utc))

    def test_store_refund_shortens_subscription_and_keeps_later_entitlement(self):
        user_id = "user-1"
        now = datetime(2026, 10, 2, tzinfo=timezone.utc)
        grants = [
            {
                "telegram_payment_charge_id": "charge-a",
                "entitlement_start": datetime(2026, 10, 1),
                "entitlement_end": datetime(2026, 10, 8),
                "refunded_at": None,
            },
            {
                "telegram_payment_charge_id": "charge-b",
                "entitlement_start": datetime(2026, 10, 8),
                "entitlement_end": datetime(2026, 10, 15),
                "refunded_at": None,
            },
        ]

        class Cursor:
            def __init__(self):
                self.queries = []
                self.fetchone_results = iter(
                    [
                        {
                            "order_id": ORDER_ID,
                            "telegram_user_id": 1234,
                            "refunded_at": None,
                            "entitlement_start": grants[0]["entitlement_start"],
                            "entitlement_end": grants[0]["entitlement_end"],
                            "user_id": user_id,
                        },
                        {"id": "subscription-1", "current_period_end": datetime(2026, 10, 15)},
                        {"id": "subscription-1"},
                    ]
                )

            def execute(self, query, params):
                self.queries.append((" ".join(query.split()), params))

            def fetchone(self):
                return next(self.fetchone_results)

            def fetchall(self):
                return grants

        class Connection:
            def __init__(self):
                self.db_cursor = Cursor()
                self.committed = False

            def start_transaction(self):
                pass

            def cursor(self, **_kwargs):
                return self.db_cursor

            def commit(self):
                self.committed = True

            def rollback(self):
                self.committed = False

            def close(self):
                pass

        connection = Connection()
        store = MariaPaymentStore(
            "mysql://user:pass@mariadb:3306/lumengallery",
            connection_factory=lambda **_kwargs: connection,
        )

        result = store.record_refund(
            80,
            1234,
            {"telegram_payment_charge_id": "charge-a"},
            now,
        )

        self.assertEqual(result, "refunded")
        self.assertTrue(connection.committed)
        subscription_update = next(
            params
            for query, params in connection.db_cursor.queries
            if query.startswith("UPDATE subscriptions SET current_period_end")
        )
        self.assertEqual(subscription_update[0], datetime(2026, 10, 9))
        user_update = next(
            params
            for query, params in connection.db_cursor.queries
            if query.startswith("UPDATE users SET is_premium")
        )
        self.assertEqual(user_update, (1, user_id))

    def test_database_host_override_reuses_the_existing_url_credentials(self):
        config = worker_module.database_config(
            "mysql://existing-user:existing-pass@mariadb:3306/lumengallery",
            host_override="127.0.0.1",
        )

        self.assertEqual(config["host"], "127.0.0.1")
        self.assertEqual(config["user"], "existing-user")
        self.assertEqual(config["password"], "existing-pass")
        self.assertLessEqual(config["connection_timeout"], 2)
        self.assertLessEqual(config["read_timeout"], 2)


if __name__ == "__main__":
    unittest.main()
