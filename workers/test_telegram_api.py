import unittest

from telegram_api import TelegramApi


class TelegramApiTests(unittest.TestCase):
    def test_stars_invoice_uses_xtr_one_price_and_omits_provider_token(self):
        calls = []

        def transport(method, payload, timeout):
            calls.append((method, payload, timeout))
            return {"ok": True, "result": {"message_id": 1}}

        api = TelegramApi("test-token", transport=transport)
        api.send_invoice(
            chat_id=123,
            title="LeakFanHub Premium",
            description="Premium 1 semaine",
            payload="lfh:0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
            currency="XTR",
            prices=[{"label": "Premium 1 semaine", "amount": 550}],
            start_parameter="p_" + "A" * 43,
        )
        method, payload, _timeout = calls[0]
        self.assertEqual(method, "sendInvoice")
        self.assertEqual(payload["currency"], "XTR")
        self.assertEqual(len(payload["prices"]), 1)
        self.assertNotIn("provider_token", payload)

    def test_precheckout_rejection_includes_a_human_readable_reason(self):
        calls = []

        def transport(method, payload, timeout):
            calls.append((method, payload, timeout))
            return {"ok": True, "result": True}

        api = TelegramApi("test-token", transport=transport)
        api.answer_pre_checkout("query", False, "Facture expirée")
        self.assertEqual(
            calls[0][1],
            {
                "pre_checkout_query_id": "query",
                "ok": False,
                "error_message": "Facture expirée",
            },
        )


if __name__ == "__main__":
    unittest.main()
