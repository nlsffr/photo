-- Stable media sitemap keysets. Safe to re-run on MariaDB 10.6+.
-- Existing deployments normally have this index from migration 008; this
-- migration makes the dependency explicit for deployments that skipped it.

ALTER TABLE photos
  ADD INDEX IF NOT EXISTS idx_photos_created_id (created_at DESC, id),
  ALGORITHM=INPLACE,
  LOCK=NONE;
