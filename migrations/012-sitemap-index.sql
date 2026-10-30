ALTER TABLE photos
  ADD INDEX IF NOT EXISTS idx_photos_sitemap (
    removed_from_index_at,
    created_at,
    id
  ),
  ALGORITHM=INPLACE,
  LOCK=NONE;
