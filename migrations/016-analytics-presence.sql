-- Privacy-preserving first-party traffic aggregates and short-lived presence.
-- Visitor hashes are derived from random first-party cookies with a server secret;
-- no raw network address is stored in these tables.
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS analytics_daily_visitors (
  day DATE NOT NULL,
  visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  page_views INT UNSIGNED NOT NULL DEFAULT 0,
  first_seen_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  first_path VARCHAR(512) NOT NULL,
  last_path VARCHAR(512) NOT NULL,
  referrer_host VARCHAR(255) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  `source` VARCHAR(64) NULL,
  PRIMARY KEY (day, visitor_hash),
  INDEX idx_analytics_daily_last_seen (day, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics_presence (
  visitor_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  last_seen_at DATETIME(6) NOT NULL,
  last_path VARCHAR(512) NOT NULL,
  INDEX idx_analytics_presence_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

