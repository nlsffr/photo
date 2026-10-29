"""Small Telegram Bot API client used by the host workers.

Official API contract: https://core.telegram.org/bots/api
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Callable


class TelegramApiError(RuntimeError):
    pass


class TelegramApi:
    def __init__(
        self,
        token: str,
        transport: Callable[[str, dict[str, Any], int], dict[str, Any]] | None = None,
    ) -> None:
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN is required")
        self._token = token
        self._transport = transport or self._http_transport

    def _http_transport(
        self, method: str, payload: dict[str, Any], timeout: int
    ) -> dict[str, Any]:
        url = f"https://api.telegram.org/bot{self._token}/{method}"
        request = urllib.request.Request(
            url,
            data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise TelegramApiError(f"telegram_{method}_request_failed") from exc
        if not result.get("ok"):
            description = str(result.get("description") or "unknown_error")[:160]
            raise TelegramApiError(f"telegram_{method}_failed: {description}")
        return result

    def call(
        self, method: str, payload: dict[str, Any], timeout: int = 15
    ) -> Any:
        return self._transport(method, payload, timeout).get("result")

    def get_updates(self, offset: int, timeout: int = 25) -> list[dict[str, Any]]:
        result = self.call(
            "getUpdates",
            {
                "offset": offset,
                "limit": 100,
                "timeout": timeout,
                "allowed_updates": ["message", "pre_checkout_query"],
            },
            timeout=timeout + 10,
        )
        return result if isinstance(result, list) else []

    def send_invoice(
        self,
        *,
        chat_id: int,
        title: str,
        description: str,
        payload: str,
        currency: str,
        prices: list[dict[str, Any]],
        start_parameter: str,
    ) -> dict[str, Any]:
        # Telegram Stars require XTR and exactly one price line. provider_token
        # is intentionally omitted for digital goods.
        if currency != "XTR" or len(prices) != 1:
            raise ValueError("invalid_stars_invoice")
        result = self.call(
            "sendInvoice",
            {
                "chat_id": chat_id,
                "title": title,
                "description": description,
                "payload": payload,
                "currency": "XTR",
                "prices": prices,
                "start_parameter": start_parameter,
            },
        )
        return result if isinstance(result, dict) else {}

    def answer_pre_checkout(
        self, query_id: str, ok: bool, error_message: str | None = None
    ) -> bool:
        payload: dict[str, Any] = {"pre_checkout_query_id": query_id, "ok": ok}
        if not ok:
            payload["error_message"] = error_message or "Paiement indisponible."
        return bool(self.call("answerPreCheckoutQuery", payload, timeout=8))

    def send_message(self, chat_id: int, text: str) -> dict[str, Any]:
        result = self.call(
            "sendMessage",
            {"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        )
        return result if isinstance(result, dict) else {}

    def refund_star_payment(self, user_id: int, charge_id: str) -> bool:
        return bool(
            self.call(
                "refundStarPayment",
                {
                    "user_id": user_id,
                    "telegram_payment_charge_id": charge_id,
                },
            )
        )
