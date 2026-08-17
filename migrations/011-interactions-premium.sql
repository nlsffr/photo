-- Interactions already in 001; expand premium subscriptions for multi-plan + telegram
SET CHARACTER SET utf8mb4;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_premium TINYINT(1) NOT NULL DEFAULT 0;

-- Allow more plan / provider values (safe if already wider)
ALTER TABLE subscriptions
  MODIFY COLUMN plan VARCHAR(32) NOT NULL DEFAULT 'week',
  MODIFY COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'manual',
  MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS premium_orders (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  plan VARCHAR(32) NOT NULL,
  method VARCHAR(32) NOT NULL,
  amount_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  crypto_asset VARCHAR(32) NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_po_user (user_id),
  INDEX idx_po_status (status),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
