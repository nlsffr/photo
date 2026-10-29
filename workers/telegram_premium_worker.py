#!/usr/bin/env python3
"""Long-poll Telegram Stars payments and activate premium transactionally."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import unquote, urlparse

from telegram_api import TelegramApi


TOKEN_RE = re.compile(r"^/start(?:@[A-Za-z0-9_]{5,32})? p_([A-Za-z0-9_-]{43})$")
PAYLOAD_RE = re.compile(
    r"^lfh:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$",
    re.IGNORECASE,
)
PLAN_DAYS = {"week": 7, "month": 30, "quarter": 90, "year": 365}
PLAN_LABELS = {
    "week": "1 semaine",
    "month": "1 mois",
    "quarter": "3 mois",
    "year": "12 mois",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def aware_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def db_time(value: datetime) -> datetime:
    return aware_utc(value).replace(tzinfo=None)


def extension_window(
    now: datetime, active_end: datetime | None, days: int
) -> tuple[datetime, datetime]:
    base = aware_utc(now)
    if active_end is not None:
        base = max(base, aware_utc(active_end))
    return base, base + timedelta(days=days)


def invoice_order_id(payload: str) -> str | None:
    match = PAYLOAD_RE.fullmatch(payload)
    return match.group(1).lower() if match else None


def database_config(database_url: str) -> dict[str, Any]:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"mysql", "mariadb"} or not parsed.hostname or not parsed.path:
        raise ValueError("invalid_database_url")
    return {
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "host": parsed.hostname,
        "port": parsed.port or 3306,
        "database": unquote(parsed.path.lstrip("/")),
        "autocommit": False,
        "charset": "utf8mb4",
        "connection_timeout": 2,
    }


class MariaPaymentStore:
    def __init__(self, database_url: str, connection_factory: Callable[..., Any] | None = None):
        self._config = database_config(database_url)
        self._connection_factory = connection_factory

    def _connect(self):
        if self._connection_factory is None:
            import mysql.connector  # type: ignore[import-untyped]

            self._connection_factory = mysql.connector.connect
        return self._connection_factory(**self._config)

    def get_offset(self) -> int:
        connection = self._connect()
        try:
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                "SELECT last_update_id FROM telegram_worker_state WHERE worker_name=%s",
                ("premium",),
            )
            row = cursor.fetchone()
            return int(row["last_update_id"]) if row else 0
        finally:
            connection.close()

    def save_offset(self, update_id: int) -> None:
        connection = self._connect()
        try:
            cursor = connection.cursor()
            cursor.execute(
                """INSERT INTO telegram_worker_state (worker_name, last_update_id)
                   VALUES (%s, %s)
                   ON DUPLICATE KEY UPDATE
                     last_update_id=GREATEST(last_update_id, VALUES(last_update_id))""",
                ("premium", update_id),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def claim_launch_token(
        self,
        token_hash: str,
        telegram_user_id: int,
        chat_id: int,
        now: datetime,
    ) -> dict[str, Any] | None:
        connection = self._connect()
        try:
            connection.start_transaction()
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                """SELECT id, plan, stars_amount, status, launch_expires_at,
                          telegram_user_id, invoice_payload
                   FROM premium_orders
                   WHERE launch_token_hash=%s AND method='telegram_stars'
                   LIMIT 1 FOR UPDATE""",
                (token_hash,),
            )
            row = cursor.fetchone()
            if not row:
                connection.commit()
                return None
            expires_at = aware_utc(row["launch_expires_at"])
            if expires_at <= aware_utc(now):
                cursor.execute(
                    "UPDATE premium_orders SET status='expired', failure_code='launch_expired' WHERE id=%s AND status NOT IN ('paid','refunded')",
                    (row["id"],),
                )
                connection.commit()
                return None
            if row["status"] in {"paid", "refunded", "failed", "expired"}:
                connection.commit()
                return None
            bound_user = row.get("telegram_user_id")
            if bound_user is not None and int(bound_user) != telegram_user_id:
                connection.commit()
                return None
            if row["plan"] not in PLAN_DAYS or not row["stars_amount"]:
                cursor.execute(
                    "UPDATE premium_orders SET status='failed', failure_code='invalid_frozen_order' WHERE id=%s",
                    (row["id"],),
                )
                connection.commit()
                return None
            payload = row.get("invoice_payload") or f"lfh:{row['id']}"
            cursor.execute(
                """UPDATE premium_orders
                   SET telegram_user_id=%s, telegram_chat_id=%s,
                       invoice_payload=%s, status='claimed', failure_code=NULL
                   WHERE id=%s""",
                (telegram_user_id, chat_id, payload, row["id"]),
            )
            connection.commit()
            row.update(
                {
                    "telegram_user_id": telegram_user_id,
                    "telegram_chat_id": chat_id,
                    "invoice_payload": payload,
                    "status": "claimed",
                }
            )
            return row
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def mark_invoice_sent(self, order_id: str, now: datetime) -> None:
        connection = self._connect()
        try:
            cursor = connection.cursor()
            cursor.execute(
                """UPDATE premium_orders
                   SET status='invoice_sent', invoice_sent_at=%s, failure_code=NULL
                   WHERE id=%s AND status IN ('claimed','invoice_sent')""",
                (db_time(now), order_id),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def get_precheckout_order(self, payload: str) -> dict[str, Any] | None:
        connection = self._connect()
        try:
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                """SELECT id, plan, stars_amount, currency, status, launch_expires_at,
                          telegram_user_id, invoice_payload
                   FROM premium_orders WHERE invoice_payload=%s LIMIT 1""",
                (payload,),
            )
            return cursor.fetchone()
        finally:
            connection.close()

    def mark_precheckout_approved(self, order_id: str, now: datetime) -> None:
        connection = self._connect()
        try:
            cursor = connection.cursor()
            cursor.execute(
                "UPDATE premium_orders SET precheckout_approved_at=%s WHERE id=%s AND status IN ('claimed','invoice_sent')",
                (db_time(now), order_id),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def activate_payment(
        self,
        update_id: int,
        telegram_user_id: int,
        payment: dict[str, Any],
        now: datetime,
    ) -> str:
        order_id = invoice_order_id(str(payment.get("invoice_payload") or ""))
        charge_id = str(payment.get("telegram_payment_charge_id") or "")
        if not order_id or not charge_id:
            raise ValueError("invalid_payment_identity")
        connection = self._connect()
        try:
            connection.start_transaction()
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                """SELECT id, user_id, plan, stars_amount, currency, status,
                          telegram_user_id, invoice_payload, telegram_payment_charge_id
                   FROM premium_orders WHERE id=%s LIMIT 1 FOR UPDATE""",
                (order_id,),
            )
            order = cursor.fetchone()
            if not order:
                raise ValueError("order_not_found")
            if (
                order["status"] == "paid"
                and order.get("telegram_payment_charge_id") == charge_id
            ):
                connection.commit()
                return "duplicate"
            if order["status"] not in {"claimed", "invoice_sent"}:
                raise ValueError("order_not_payable")
            if int(order["telegram_user_id"]) != telegram_user_id:
                raise ValueError("telegram_user_mismatch")
            if order["currency"] != "XTR" or payment.get("currency") != "XTR":
                raise ValueError("currency_mismatch")
            if int(order["stars_amount"]) != int(payment.get("total_amount") or -1):
                raise ValueError("amount_mismatch")
            if order["invoice_payload"] != payment.get("invoice_payload"):
                raise ValueError("payload_mismatch")
            days = PLAN_DAYS.get(order["plan"])
            if not days:
                raise ValueError("unknown_plan")

            cursor.execute(
                """SELECT order_id FROM telegram_payments
                   WHERE telegram_update_id=%s OR telegram_payment_charge_id=%s OR order_id=%s
                   LIMIT 1 FOR UPDATE""",
                (update_id, charge_id, order_id),
            )
            existing = cursor.fetchone()
            if existing:
                if existing["order_id"] == order_id:
                    connection.commit()
                    return "duplicate"
                raise ValueError("payment_replay")

            cursor.execute(
                """SELECT id, current_period_end FROM subscriptions
                   WHERE user_id=%s AND status='active'
                   ORDER BY current_period_end DESC LIMIT 1 FOR UPDATE""",
                (order["user_id"],),
            )
            active = cursor.fetchone()
            start, end = extension_window(
                now, active.get("current_period_end") if active else None, days
            )
            if active:
                cursor.execute(
                    "UPDATE subscriptions SET status='canceled' WHERE user_id=%s AND status='active' AND id<>%s",
                    (order["user_id"], active["id"]),
                )
                cursor.execute(
                    """UPDATE subscriptions
                       SET provider='telegram_stars', provider_ref=%s,
                           current_period_end=%s, status='active'
                       WHERE id=%s""",
                    (charge_id, db_time(end), active["id"]),
                )
            else:
                cursor.execute(
                    """INSERT INTO subscriptions
                       (id, user_id, plan, status, provider, provider_ref,
                        current_period_start, current_period_end)
                       VALUES (%s, %s, %s, 'active', 'telegram_stars', %s, %s, %s)""",
                    (
                        str(uuid.uuid4()),
                        order["user_id"],
                        order["plan"],
                        charge_id,
                        db_time(start),
                        db_time(end),
                    ),
                )

            cursor.execute(
                "UPDATE users SET is_premium=1 WHERE id=%s", (order["user_id"],)
            )
            cursor.execute(
                """UPDATE premium_orders
                   SET status='paid', telegram_payment_charge_id=%s, paid_at=%s,
                       failure_code=NULL
                   WHERE id=%s""",
                (charge_id, db_time(now), order_id),
            )
            cursor.execute(
                """INSERT INTO telegram_payments
                   (order_id, telegram_update_id, telegram_user_id,
                    telegram_payment_charge_id, provider_payment_charge_id,
                    currency, total_amount, paid_at)
                   VALUES (%s, %s, %s, %s, %s, 'XTR', %s, %s)""",
                (
                    order_id,
                    update_id,
                    telegram_user_id,
                    charge_id,
                    payment.get("provider_payment_charge_id") or None,
                    int(payment["total_amount"]),
                    db_time(now),
                ),
            )
            connection.commit()
            return "activated"
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def record_refund(
        self,
        _update_id: int,
        telegram_user_id: int,
        refund: dict[str, Any],
        now: datetime,
    ) -> str:
        charge_id = str(refund.get("telegram_payment_charge_id") or "")
        if not charge_id:
            raise ValueError("missing_refund_charge")
        connection = self._connect()
        try:
            connection.start_transaction()
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                """SELECT order_id, telegram_user_id, refunded_at
                   FROM telegram_payments
                   WHERE telegram_payment_charge_id=%s LIMIT 1 FOR UPDATE""",
                (charge_id,),
            )
            payment = cursor.fetchone()
            if not payment:
                raise ValueError("payment_not_found")
            if int(payment["telegram_user_id"]) != telegram_user_id:
                raise ValueError("refund_user_mismatch")
            if payment.get("refunded_at"):
                connection.commit()
                return "duplicate"
            cursor.execute(
                "UPDATE telegram_payments SET refunded_at=%s WHERE telegram_payment_charge_id=%s",
                (db_time(now), charge_id),
            )
            cursor.execute(
                "UPDATE premium_orders SET status='refunded', refunded_at=%s WHERE id=%s",
                (db_time(now), payment["order_id"]),
            )
            connection.commit()
            return "refunded"
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()


class PaymentWorker:
    def __init__(
        self,
        store: Any,
        api: Any,
        *,
        now: Callable[[], datetime] = utc_now,
        site_url: str = "https://leakfanhub.com",
    ) -> None:
        self.store = store
        self.api = api
        self.now = now
        self.site_url = site_url.rstrip("/")

    def _handle_start(self, message: dict[str, Any], token: str) -> None:
        telegram_user_id = int(message["from"]["id"])
        chat_id = int(message["chat"]["id"])
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        order = self.store.claim_launch_token(
            token_hash, telegram_user_id, chat_id, self.now()
        )
        if not order:
            self.api.send_message(
                chat_id,
                "Ce lien de paiement est invalide, expiré ou déjà utilisé. Reviens sur le site pour en créer un nouveau.",
            )
            return
        plan = str(order["plan"])
        label = PLAN_LABELS.get(plan)
        if not label:
            raise ValueError("unknown_plan")
        self.api.send_invoice(
            chat_id=chat_id,
            title="LeakFanHub Premium",
            description=f"Accès Premium pendant {label}.",
            payload=order["invoice_payload"],
            currency="XTR",
            prices=[
                {
                    "label": f"Premium {label}",
                    "amount": int(order["stars_amount"]),
                }
            ],
            start_parameter=f"p_{token}",
        )
        self.store.mark_invoice_sent(order["id"], self.now())

    def _handle_precheckout(self, query: dict[str, Any]) -> None:
        payload = str(query.get("invoice_payload") or "")
        try:
            order = self.store.get_precheckout_order(payload)
        except Exception:
            self.api.answer_pre_checkout(
                query["id"],
                False,
                "La vérification du paiement est temporairement indisponible. Réessaie.",
            )
            return
        error = None
        if not order or order.get("status") not in {"claimed", "invoice_sent"}:
            error = "Cette facture n’est plus disponible."
        elif aware_utc(order["launch_expires_at"]) <= aware_utc(self.now()):
            error = "Cette facture a expiré. Reviens sur le site."
        elif int(order["telegram_user_id"]) != int(query["from"]["id"]):
            error = "Cette facture appartient à un autre compte Telegram."
        elif order.get("currency") != "XTR" or query.get("currency") != "XTR":
            error = "La devise de cette facture est invalide."
        elif int(order["stars_amount"]) != int(query.get("total_amount") or -1):
            error = "Le montant de cette facture ne correspond plus."
        elif order.get("invoice_payload") != payload:
            error = "La référence de cette facture est invalide."

        self.api.answer_pre_checkout(query["id"], error is None, error)
        if error is None:
            self.store.mark_precheckout_approved(order["id"], self.now())

    def _handle_message(self, update_id: int, message: dict[str, Any]) -> None:
        chat_id = int(message["chat"]["id"])
        telegram_user_id = int(message["from"]["id"])
        successful = message.get("successful_payment")
        if isinstance(successful, dict):
            result = self.store.activate_payment(
                update_id, telegram_user_id, successful, self.now()
            )
            if result == "activated":
                self.api.send_message(
                    chat_id,
                    "✅ Paiement confirmé. Premium est activé sur ton compte LeakFanHub.",
                )
            return

        refunded = message.get("refunded_payment")
        if isinstance(refunded, dict):
            self.store.record_refund(update_id, telegram_user_id, refunded, self.now())
            return

        text = str(message.get("text") or "").strip()
        start = TOKEN_RE.fullmatch(text)
        if start:
            self._handle_start(message, start.group(1))
        elif text == "/terms":
            self.api.send_message(
                chat_id, f"Conditions du service : {self.site_url}/conditions"
            )
        elif text in {"/support", "/paysupport"}:
            self.api.send_message(
                chat_id,
                f"Support et questions de paiement : {self.site_url}/contact/support",
            )

    def handle_update(self, update: dict[str, Any]) -> None:
        update_id = int(update["update_id"])
        precheckout = update.get("pre_checkout_query")
        if isinstance(precheckout, dict):
            self._handle_precheckout(precheckout)
            return
        message = update.get("message")
        if isinstance(message, dict) and message.get("from") and message.get("chat"):
            self._handle_message(update_id, message)

    def process_batch(self, updates: list[dict[str, Any]]) -> None:
        for update in sorted(updates, key=lambda item: int(item["update_id"])):
            self.handle_update(update)
            self.store.save_offset(int(update["update_id"]))


def log_event(event: str, **fields: Any) -> None:
    logging.info(json.dumps({"event": event, **fields}, separators=(",", ":")))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    database_url = os.environ.get("TELEGRAM_WORKER_DATABASE_URL") or os.environ.get(
        "DATABASE_URL", ""
    )
    if not token or not database_url:
        raise SystemExit("TELEGRAM_BOT_TOKEN and DATABASE_URL are required")
    store = MariaPaymentStore(database_url)
    api = TelegramApi(token)
    worker = PaymentWorker(
        store,
        api,
        site_url=os.environ.get("SITE_URL", "https://leakfanhub.com"),
    )
    last_update_id = store.get_offset()
    log_event("telegram_premium_worker_started", last_update_id=last_update_id)

    while True:
        try:
            updates = api.get_updates(last_update_id + 1, timeout=25)
            worker.process_batch(updates)
            if updates:
                last_update_id = max(int(update["update_id"]) for update in updates)
        except Exception as exc:
            last_update_id = store.get_offset()
            log_event(
                "telegram_premium_worker_error",
                error=type(exc).__name__,
            )
            time.sleep(3)


if __name__ == "__main__":
    main()
