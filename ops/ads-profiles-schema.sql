-- MariaDB additive migration. Preview column definitions before applying.
-- Apply before starting code that selects ad_settings.profile.
-- Re-running preserves the existing profile, master setting and all history.
ALTER TABLE ad_settings
  ADD COLUMN IF NOT EXISTS profile VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'current';

-- Nullable defaults preserve unknown profile history from older clients/releases.
ALTER TABLE ad_settings_history
  ADD COLUMN IF NOT EXISTS previous_profile VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS next_profile VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL DEFAULT NULL;
