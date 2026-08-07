CREATE TABLE IF NOT EXISTS contact_messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  kind VARCHAR(40) NOT NULL DEFAULT 'contact',
  email VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  meta_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_created (created_at),
  INDEX idx_contact_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
