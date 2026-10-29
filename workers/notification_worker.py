#!/usr/bin/env python3
"""Drain durable contact/report notifications to the Telegram admin chat."""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Any, Callable

from telegram_api import TelegramApi
from telegram_premium_worker import database_config, db_time, log_event, utc_now


MAX_ATTEMPTS = 8
PROCESSED_EVENT_DELAY_SECONDS = 1.1
EMPTY_QUEUE_DELAY_SECONDS = 2.0


def retry_delay_seconds(attempts: int) -> int:
    return min(3600, 30 * (2 ** max(0, attempts - 1)))


def run_iteration(
    worker: Any,
    *,
    sleep: Callable[[float], None] = time.sleep,
) -> bool:
    """Process at most one event and pace the next Telegram API call."""

    processed = worker.run_once()
    sleep(
        PROCESSED_EVENT_DELAY_SECONDS
        if processed
        else EMPTY_QUEUE_DELAY_SECONDS
    )
    return processed


class MariaOutboxStore:
    def __init__(
        self,
        database_url: str,
        connection_factory: Callable[..., Any] | None = None,
        *,
        host_override: str | None = None,
    ):
        self._config = database_config(database_url, host_override=host_override)
        self._connection_factory = connection_factory

    def _connect(self):
        if self._connection_factory is None:
            import mysql.connector  # type: ignore[import-untyped]

            self._connection_factory = mysql.connector.connect
        return self._connection_factory(**self._config)

    def claim_next(self, now: datetime) -> dict[str, Any] | None:
        connection = self._connect()
        try:
            connection.start_transaction()
            cursor = connection.cursor(dictionary=True)
            cursor.execute(
                """SELECT id, attempts, payload_json
                   FROM notification_outbox
                   WHERE destination='telegram_admin'
                     AND available_at <= %s
                     AND attempts < %s
                     AND (
                       status='pending'
                       OR (status='leased' AND leased_until < %s)
                     )
                   ORDER BY available_at, created_at
                   LIMIT 1 FOR UPDATE SKIP LOCKED""",
                (db_time(now), MAX_ATTEMPTS, db_time(now)),
            )
            row = cursor.fetchone()
            if not row:
                connection.commit()
                return None
            attempts = int(row["attempts"]) + 1
            cursor.execute(
                """UPDATE notification_outbox
                   SET status='leased', attempts=%s, leased_until=%s
                   WHERE id=%s""",
                (attempts, db_time(now + timedelta(seconds=60)), row["id"]),
            )
            connection.commit()
            row["attempts"] = attempts
            payload = row.get("payload_json")
            if isinstance(payload, str):
                row["payload_json"] = json.loads(payload)
            return row
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def mark_delivered(self, event_id: str, now: datetime) -> None:
        connection = self._connect()
        try:
            cursor = connection.cursor()
            cursor.execute(
                """UPDATE notification_outbox
                   SET status='delivered', delivered_at=%s, leased_until=NULL,
                       last_error=NULL
                   WHERE id=%s AND status='leased'""",
                (db_time(now), event_id),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def mark_failed(
        self,
        event_id: str,
        attempts: int,
        error_code: str,
        now: datetime,
    ) -> None:
        terminal = attempts >= MAX_ATTEMPTS
        available_at = now + timedelta(seconds=retry_delay_seconds(attempts))
        connection = self._connect()
        try:
            cursor = connection.cursor()
            cursor.execute(
                """UPDATE notification_outbox
                   SET status=%s, available_at=%s, leased_until=NULL, last_error=%s
                   WHERE id=%s AND status='leased'""",
                (
                    "failed" if terminal else "pending",
                    db_time(available_at),
                    error_code[:255],
                    event_id,
                ),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()


class NotificationWorker:
    def __init__(
        self,
        store: Any,
        api: Any,
        *,
        admin_chat_id: int,
        now: Callable[[], datetime] = utc_now,
    ) -> None:
        self.store = store
        self.api = api
        self.admin_chat_id = admin_chat_id
        self.now = now

    def run_once(self) -> bool:
        event = self.store.claim_next(self.now())
        if not event:
            return False
        try:
            payload = event.get("payload_json")
            text = payload.get("text") if isinstance(payload, dict) else None
            if not isinstance(text, str) or not text.strip():
                raise ValueError("invalid_notification_payload")
            self.api.send_message(self.admin_chat_id, text[:4000])
            self.store.mark_delivered(event["id"], self.now())
        except Exception as exc:
            # Persist only the exception class, never the message: transport
            # errors can contain URLs or credentials.
            self.store.mark_failed(
                event["id"], int(event["attempts"]), type(exc).__name__, self.now()
            )
        return True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    database_url = os.environ.get("DATABASE_URL", "")
    database_host = os.environ.get("TELEGRAM_WORKER_DATABASE_HOST") or None
    admin_chat_id = os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or os.environ.get(
        "TELEGRAM_CHAT_ID", ""
    )
    if not token or not database_url or not admin_chat_id:
        raise SystemExit(
            "TELEGRAM_BOT_TOKEN, DATABASE_URL and TELEGRAM_ADMIN_CHAT_ID are required"
        )
    store = MariaOutboxStore(database_url, host_override=database_host)
    worker = NotificationWorker(
        store,
        TelegramApi(token),
        admin_chat_id=int(admin_chat_id),
    )
    log_event("notification_worker_started")
    while True:
        try:
            run_iteration(worker)
        except Exception as exc:
            log_event("notification_worker_error", error=type(exc).__name__)
            time.sleep(3)


if __name__ == "__main__":
    main()
