-- Bot ingest tracking — prevents re-downloading the same source media.
-- Used by MegaBot (host-side) writing into the same MariaDB as the app.

CREATE TABLE IF NOT EXISTS bot_ingested (
  source_id BIGINT PRIMARY KEY,
  photo_id CHAR(36) NOT NULL,
  creator_handle VARCHAR(100) NOT NULL,
  minio_key VARCHAR(500) NOT NULL,
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_bot_handle (creator_handle),
  INDEX idx_bot_photo (photo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
