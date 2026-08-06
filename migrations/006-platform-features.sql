-- LumenGallery — Platform features
-- cover créateur, collections, premium, reports, indexes recherche
-- Safe to re-run: uses IF NOT EXISTS / procedure guards where needed.

SET CHARACTER SET utf8mb4;
SET COLLATION_CONNECTION = utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Creators: cover banner
-- ---------------------------------------------------------------------------
ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS cover_url VARCHAR(500) NULL AFTER avatar_url;

-- ---------------------------------------------------------------------------
-- Photos: ensure columns used by bot + filters
-- ---------------------------------------------------------------------------
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS is_ai TINYINT(1) NOT NULL DEFAULT 0 AFTER likes_count,
  ADD COLUMN IF NOT EXISTS has_watermark TINYINT(1) NOT NULL DEFAULT 0 AFTER is_ai,
  ADD COLUMN IF NOT EXISTS file_size BIGINT NULL AFTER has_watermark,
  ADD COLUMN IF NOT EXISTS source_id VARCHAR(191) NULL AFTER file_size,
  ADD COLUMN IF NOT EXISTS preview_url TEXT NULL AFTER source_id;

-- type already includes photo/video; keep pack if 003 ran
-- Indexes for discovery
CREATE INDEX IF NOT EXISTS idx_photos_is_ai ON photos (is_ai);
CREATE INDEX IF NOT EXISTS idx_photos_views ON photos (views_count);
CREATE INDEX IF NOT EXISTS idx_photos_likes ON photos (likes_count);
CREATE INDEX IF NOT EXISTS idx_photos_duration ON photos (duration_sec);
CREATE INDEX IF NOT EXISTS idx_photos_source ON photos (source_id);
CREATE INDEX IF NOT EXISTS idx_photos_type_created ON photos (type, created_at);

-- ---------------------------------------------------------------------------
-- Collections (named favorites lists)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collections (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_collections_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id CHAR(36) NOT NULL,
  photo_id CHAR(36) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (collection_id, photo_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  INDEX idx_ci_photo (photo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Premium subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  plan ENUM('premium_monthly') NOT NULL DEFAULT 'premium_monthly',
  status ENUM('active','canceled','past_due','trialing') NOT NULL DEFAULT 'active',
  provider ENUM('stripe','crypto','manual') NOT NULL DEFAULT 'stripe',
  provider_ref VARCHAR(191) NULL,
  current_period_start TIMESTAMP NULL,
  current_period_end TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_sub_user_active (user_id, status),
  INDEX idx_sub_end (current_period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_premium TINYINT(1) NOT NULL DEFAULT 0 AFTER is_creator;

-- ---------------------------------------------------------------------------
-- Reports / DMCA
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id CHAR(36) PRIMARY KEY,
  reporter_user_id CHAR(36) NULL,
  photo_id CHAR(36) NULL,
  creator_id CHAR(36) NULL,
  reason ENUM('dmca','illegal','spam','other') NOT NULL DEFAULT 'other',
  message TEXT,
  status ENUM('open','reviewing','resolved','rejected') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE SET NULL,
  FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE SET NULL,
  INDEX idx_reports_status (status),
  INDEX idx_reports_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Optional view events (analytics lite)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_views (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  photo_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  INDEX idx_mv_photo_time (photo_id, viewed_at),
  INDEX idx_mv_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
