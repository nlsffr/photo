-- Scale indexes for 100k–1M+ medias (SEO crawl + list pages)
-- Safe to re-run (IF NOT EXISTS)

-- Resolve media by external source_id (URL /handle/{id})
CREATE INDEX IF NOT EXISTS idx_bot_ingested_source_id ON bot_ingested(source_id);
CREATE INDEX IF NOT EXISTS idx_bot_ingested_photo_id ON bot_ingested(photo_id);

-- Creator gallery sorts
CREATE INDEX IF NOT EXISTS idx_photos_creator_views ON photos(creator_id, views_count DESC);
CREATE INDEX IF NOT EXISTS idx_photos_creator_likes ON photos(creator_id, likes_count DESC);

-- AI filter
CREATE INDEX IF NOT EXISTS idx_photos_is_ai ON photos(is_ai);

-- Longest videos
CREATE INDEX IF NOT EXISTS idx_photos_duration ON photos(duration_sec);

-- Models ranking
CREATE INDEX IF NOT EXISTS idx_creators_followers_desc ON creators(followers_count DESC);

-- Tags discovery
CREATE INDEX IF NOT EXISTS idx_photo_tags_tag ON photo_tags(tag);
