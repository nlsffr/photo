-- Telegram Stars premium activation + durable Telegram notification outbox.
-- Additive and safe to re-run on MariaDB 10.6+.

SET CHARACTER SET utf8mb4;
SET COLLATION_CONNECTION = utf8mb4_unicode_ci;

ALTER TABLE premium_orders
  ADD COLUMN IF NOT EXISTS stars_amount INT UNSIGNED NULL AFTER amount_usd,
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NULL AFTER stars_amount,
  ADD COLUMN IF NOT EXISTS launch_token_hash CHAR(64) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS launch_expires_at DATETIME(3) NULL AFTER launch_token_hash,
  ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT UNSIGNED NULL AFTER launch_expires_at,
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT NULL AFTER telegram_user_id,
  ADD COLUMN IF NOT EXISTS invoice_payload VARCHAR(128) NULL AFTER telegram_chat_id,
  ADD COLUMN IF NOT EXISTS invoice_sent_at DATETIME(3) NULL AFTER invoice_payload,
  ADD COLUMN IF NOT EXISTS precheckout_approved_at DATETIME(3) NULL AFTER invoice_sent_at,
  ADD COLUMN IF NOT EXISTS telegram_payment_charge_id VARCHAR(191) NULL AFTER precheckout_approved_at,
  ADD COLUMN IF NOT EXISTS paid_at DATETIME(3) NULL AFTER telegram_payment_charge_id,
  ADD COLUMN IF NOT EXISTS refunded_at DATETIME(3) NULL AFTER paid_at,
  ADD COLUMN IF NOT EXISTS failure_code VARCHAR(64) NULL AFTER refunded_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_po_launch_token_hash
  ON premium_orders (launch_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_po_invoice_payload
  ON premium_orders (invoice_payload);
CREATE UNIQUE INDEX IF NOT EXISTS uq_po_telegram_charge
  ON premium_orders (telegram_payment_charge_id);
CREATE INDEX IF NOT EXISTS idx_po_launch_claim
  ON premium_orders (launch_token_hash, status, launch_expires_at);
CREATE INDEX IF NOT EXISTS idx_po_user_status_created
  ON premium_orders (user_id, status, created_at);

CREATE TABLE IF NOT EXISTS telegram_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  telegram_update_id BIGINT NOT NULL,
  telegram_user_id BIGINT UNSIGNED NOT NULL,
  telegram_payment_charge_id VARCHAR(191) NOT NULL,
  provider_payment_charge_id VARCHAR(191) NULL,
  currency CHAR(3) NOT NULL,
  total_amount INT UNSIGNED NOT NULL,
  entitlement_start DATETIME(3) NULL,
  entitlement_end DATETIME(3) NULL,
  paid_at DATETIME(3) NOT NULL,
  refunded_at DATETIME(3) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tp_order (order_id),
  UNIQUE KEY uq_tp_update (telegram_update_id),
  UNIQUE KEY uq_tp_charge (telegram_payment_charge_id),
  CONSTRAINT fk_tp_order FOREIGN KEY (order_id)
    REFERENCES premium_orders(id) ON DELETE RESTRICT,
  INDEX idx_tp_user_paid (telegram_user_id, paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Keep the migration re-runnable when the table was created by an earlier
-- revision of migration 017.
ALTER TABLE telegram_payments
  ADD COLUMN IF NOT EXISTS entitlement_start DATETIME(3) NULL AFTER total_amount,
  ADD COLUMN IF NOT EXISTS entitlement_end DATETIME(3) NULL AFTER entitlement_start;

CREATE TABLE IF NOT EXISTS telegram_worker_state (
  worker_name VARCHAR(64) NOT NULL PRIMARY KEY,
  last_update_id BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_failed_updates (
  telegram_update_id BIGINT NOT NULL PRIMARY KEY,
  update_kind VARCHAR(64) NOT NULL,
  error_code VARCHAR(64) NOT NULL,
  telegram_payment_charge_id VARCHAR(191) NULL,
  failed_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  INDEX idx_tfu_last_seen (last_seen_at),
  INDEX idx_tfu_charge (telegram_payment_charge_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  aggregate_id CHAR(36) NOT NULL,
  destination VARCHAR(64) NOT NULL DEFAULT 'telegram_admin',
  payload_json JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  leased_until DATETIME(3) NULL,
  delivered_at DATETIME(3) NULL,
  last_error VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_outbox_event (event_type, aggregate_id, destination),
  INDEX idx_outbox_claim (status, available_at, leased_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The former unique key allowed only one row per (user,status), which blocked
-- a second historical renewal after the first row became canceled.
DROP INDEX IF EXISTS uq_sub_user_active ON subscriptions;
CREATE INDEX IF NOT EXISTS idx_sub_user_status_end
  ON subscriptions (user_id, status, current_period_end);
