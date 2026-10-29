-- Public URL lifecycle columns used by sitemap, middleware, and removal policy.
-- Production received these columns before the migration repository was wired;
-- keep this bootstrap additive so both fresh and existing databases converge.

ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS url_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS removed_from_index_at DATETIME NULL DEFAULT NULL;

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS url_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS removed_from_index_at DATETIME NULL DEFAULT NULL,
  ADD INDEX IF NOT EXISTS idx_photos_url_version (url_version);
