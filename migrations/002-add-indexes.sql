-- Additional production indexes for performance

-- Search by creator + date
CREATE INDEX IF NOT EXISTS idx_photos_creator_created ON photos(creator_id, created_at DESC);

-- Tag-based search / discovery
CREATE INDEX IF NOT EXISTS idx_photo_tags_tag_id ON photo_tags(tag, photo_id);

-- Like leaderboards
CREATE INDEX IF NOT EXISTS idx_photos_likes_created ON photos(likes_count DESC, created_at DESC);

-- View tracking
CREATE INDEX IF NOT EXISTS idx_photos_views_created ON photos(views_count DESC, created_at DESC);

-- Follow feed (recent posts from followed creators)
CREATE INDEX IF NOT EXISTS idx_likes_user_created ON likes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower_created ON follows(follower_id, created_at DESC);

-- Photo search (type filter)
CREATE INDEX IF NOT EXISTS idx_photos_type_created ON photos(type, created_at DESC);
