-- Private metadata overrides and append-only history. No catalogue rows change.
-- Apply before enabling the editor. No defaults or credentials are inserted.
CREATE TABLE IF NOT EXISTS seo_page_settings (
  page_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  locale CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  revision INT UNSIGNED NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  PRIMARY KEY (page_key, locale),
  CONSTRAINT chk_seo_settings_page CHECK (page_key IN ('home', 'models', 'trending', 'mostLiked', 'rankings', 'influencers')),
  CONSTRAINT chk_seo_settings_locale CHECK (locale IN ('en', 'fr', 'es', 'de', 'it', 'pt', 'nl')),
  CONSTRAINT chk_seo_settings_revision CHECK (revision > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seo_page_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  page_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  locale CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  previous_title VARCHAR(300) NOT NULL,
  previous_description TEXT NOT NULL,
  next_title VARCHAR(300) NOT NULL,
  next_description TEXT NOT NULL,
  previous_revision INT UNSIGNED NOT NULL,
  next_revision INT UNSIGNED NOT NULL,
  actor_user_id CHAR(36) NOT NULL,
  changed_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_seo_history_revision (page_key, locale, next_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roll back application integration first. Keep both tables to preserve edits
-- and their audit trail; dropping them is not part of application rollback.
