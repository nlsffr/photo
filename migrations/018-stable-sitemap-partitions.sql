-- Stable media sitemap keysets. Safe to re-run on MariaDB 10.6+.
-- Ascending order matches the immutable oldest-first keyset scan. Keep a
-- distinct name because migration 008 created a descending feed index.

ALTER TABLE photos
  ADD INDEX IF NOT EXISTS idx_photos_sitemap_keyset (created_at ASC, id ASC),
  ALGORITHM=INPLACE,
  LOCK=NONE;
