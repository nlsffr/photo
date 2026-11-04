-- Explicit provisioning only. Re-running preserves every existing setting.
CREATE TABLE IF NOT EXISTS ad_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  placements JSON NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NULL,
  updated_by VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  CONSTRAINT chk_ads_singleton CHECK (id=1),
  CONSTRAINT chk_ads_enabled CHECK (enabled IN (0,1))
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ad_settings_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  previous_revision INT UNSIGNED NOT NULL,
  next_revision INT UNSIGNED NOT NULL,
  previous_enabled TINYINT UNSIGNED NOT NULL,
  next_enabled TINYINT UNSIGNED NOT NULL,
  previous_placements JSON NOT NULL,
  next_placements JSON NOT NULL,
  actor_user_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  changed_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_ads_revision (next_revision)
) ENGINE=InnoDB;
INSERT IGNORE INTO ad_settings (id,enabled,placements,revision)
VALUES (1,0,'{"header":true,"footer":true,"underVideo":true,"feed":true,"popunder":true,"interstitial":true,"slider":true}',0);
