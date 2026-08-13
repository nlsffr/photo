-- Perf indexes for large catalogs (safe to re-run on MariaDB 10.5+)
-- Apply: docker exec -i photo-mariadb-1 mariadb -u lumen -p'$DB_PASSWORD' leakfanhub < migrations/008-perf-indexes.sql

-- Cursor / recent feed
CREATE INDEX IF NOT EXISTS idx_photos_created_id ON photos (created_at DESC, id);

-- Trending / popular sorts
CREATE INDEX IF NOT EXISTS idx_photos_views_id ON photos (views_count DESC, id);
CREATE INDEX IF NOT EXISTS idx_photos_likes_id ON photos (likes_count DESC, id);

-- Duration sort (longest videos)
CREATE INDEX IF NOT EXISTS idx_photos_duration ON photos (duration_sec DESC);

-- Filters
CREATE INDEX IF NOT EXISTS idx_photos_type_views ON photos (type, views_count DESC);
CREATE INDEX IF NOT EXISTS idx_photos_is_ai ON photos (is_ai, created_at DESC);

-- Creator pages
CREATE INDEX IF NOT EXISTS idx_photos_creator_views ON photos (creator_id, views_count DESC);
CREATE INDEX IF NOT EXISTS idx_photos_creator_likes ON photos (creator_id, likes_count DESC);

-- Bot dedup / lookups
CREATE INDEX IF NOT EXISTS idx_photos_source_id ON photos (source_id);
CREATE INDEX IF NOT EXISTS idx_bot_ingested_source ON bot_ingested (source_id);

-- Creators listing
CREATE INDEX IF NOT EXISTS idx_creators_followers ON creators (followers_count DESC);

ANALYZE TABLE photos;
ANALYZE TABLE creators;
ANALYZE TABLE bot_ingested;
ANALYZE TABLE photo_tags;
