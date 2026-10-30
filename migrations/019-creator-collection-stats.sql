-- Keep creator collection eligibility cheap enough for sitemap requests.
-- Only structural/source changes touch this table; local view increments do not.

CREATE TABLE IF NOT EXISTS creator_collection_stats (
  creator_id CHAR(36) NOT NULL,
  media_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  photo_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  video_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  engaged_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_content_at TIMESTAMP NULL DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (creator_id),
  CONSTRAINT fk_creator_collection_stats_creator
    FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TRIGGER IF EXISTS trg_photos_collection_stats_ai;
DROP TRIGGER IF EXISTS trg_photos_collection_stats_au;
DROP TRIGGER IF EXISTS trg_photos_collection_stats_ad;

DELIMITER $$

CREATE TRIGGER trg_photos_collection_stats_ai
AFTER INSERT ON photos
FOR EACH ROW
BEGIN
  IF NEW.removed_from_index_at IS NULL THEN
    INSERT INTO creator_collection_stats (
      creator_id,
      media_count,
      photo_count,
      video_count,
      engaged_count,
      last_content_at
    ) VALUES (
      NEW.creator_id,
      1,
      IF(NEW.type = 'photo', 1, 0),
      IF(NEW.type = 'video', 1, 0),
      IF(
        COALESCE(NEW.source_views_count, 0) > 0
        OR COALESCE(NEW.source_likes_count, 0) > 0,
        1,
        0
      ),
      NEW.created_at
    )
    ON DUPLICATE KEY UPDATE
      media_count = media_count + VALUES(media_count),
      photo_count = photo_count + VALUES(photo_count),
      video_count = video_count + VALUES(video_count),
      engaged_count = engaged_count + VALUES(engaged_count),
      last_content_at = CASE
        WHEN last_content_at IS NULL THEN VALUES(last_content_at)
        WHEN VALUES(last_content_at) IS NULL THEN last_content_at
        ELSE GREATEST(last_content_at, VALUES(last_content_at))
      END;
  END IF;
END$$

CREATE TRIGGER trg_photos_collection_stats_au
AFTER UPDATE ON photos
FOR EACH ROW
BEGIN
  IF NOT (OLD.creator_id <=> NEW.creator_id)
     OR NOT (OLD.removed_from_index_at <=> NEW.removed_from_index_at)
     OR NOT (OLD.type <=> NEW.type)
     OR NOT (OLD.created_at <=> NEW.created_at)
     OR (
       (COALESCE(OLD.source_views_count, 0) > 0 OR COALESCE(OLD.source_likes_count, 0) > 0)
       <>
       (COALESCE(NEW.source_views_count, 0) > 0 OR COALESCE(NEW.source_likes_count, 0) > 0)
     ) THEN
    INSERT INTO creator_collection_stats (
      creator_id,
      media_count,
      photo_count,
      video_count,
      engaged_count,
      last_content_at
    )
    SELECT OLD.creator_id,
           COUNT(p.id),
           COALESCE(SUM(p.type = 'photo'), 0),
           COALESCE(SUM(p.type = 'video'), 0),
           COALESCE(SUM(
             COALESCE(p.source_views_count, 0) > 0
             OR COALESCE(p.source_likes_count, 0) > 0
           ), 0),
           MAX(p.created_at)
    FROM photos p
    WHERE p.creator_id = OLD.creator_id
      AND p.removed_from_index_at IS NULL
    ON DUPLICATE KEY UPDATE
      media_count = VALUES(media_count),
      photo_count = VALUES(photo_count),
      video_count = VALUES(video_count),
      engaged_count = VALUES(engaged_count),
      last_content_at = VALUES(last_content_at);

    IF NOT (OLD.creator_id <=> NEW.creator_id) THEN
      INSERT INTO creator_collection_stats (
        creator_id,
        media_count,
        photo_count,
        video_count,
        engaged_count,
        last_content_at
      )
      SELECT NEW.creator_id,
             COUNT(p.id),
             COALESCE(SUM(p.type = 'photo'), 0),
             COALESCE(SUM(p.type = 'video'), 0),
             COALESCE(SUM(
               COALESCE(p.source_views_count, 0) > 0
               OR COALESCE(p.source_likes_count, 0) > 0
             ), 0),
             MAX(p.created_at)
      FROM photos p
      WHERE p.creator_id = NEW.creator_id
        AND p.removed_from_index_at IS NULL
      ON DUPLICATE KEY UPDATE
        media_count = VALUES(media_count),
        photo_count = VALUES(photo_count),
        video_count = VALUES(video_count),
        engaged_count = VALUES(engaged_count),
        last_content_at = VALUES(last_content_at);
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_photos_collection_stats_ad
AFTER DELETE ON photos
FOR EACH ROW
BEGIN
  INSERT INTO creator_collection_stats (
    creator_id,
    media_count,
    photo_count,
    video_count,
    engaged_count,
    last_content_at
  )
  SELECT OLD.creator_id,
         COUNT(p.id),
         COALESCE(SUM(p.type = 'photo'), 0),
         COALESCE(SUM(p.type = 'video'), 0),
         COALESCE(SUM(
           COALESCE(p.source_views_count, 0) > 0
           OR COALESCE(p.source_likes_count, 0) > 0
         ), 0),
         MAX(p.created_at)
  FROM photos p
  WHERE p.creator_id = OLD.creator_id
    AND p.removed_from_index_at IS NULL
  ON DUPLICATE KEY UPDATE
    media_count = VALUES(media_count),
    photo_count = VALUES(photo_count),
    video_count = VALUES(video_count),
    engaged_count = VALUES(engaged_count),
    last_content_at = VALUES(last_content_at);
END$$

DELIMITER ;

-- Reconcile the complete public catalog after the online triggers exist.
-- The brief lock closes the snapshot/upsert race without stopping the workers.
LOCK TABLES photos AS p READ, creators READ, creator_collection_stats WRITE;

UPDATE creator_collection_stats
SET media_count = 0,
    photo_count = 0,
    video_count = 0,
    engaged_count = 0,
    last_content_at = NULL;

INSERT INTO creator_collection_stats (
  creator_id,
  media_count,
  photo_count,
  video_count,
  engaged_count,
  last_content_at
)
SELECT p.creator_id,
       COUNT(*),
       COALESCE(SUM(p.type = 'photo'), 0),
       COALESCE(SUM(p.type = 'video'), 0),
       COALESCE(SUM(
         COALESCE(p.source_views_count, 0) > 0
         OR COALESCE(p.source_likes_count, 0) > 0
       ), 0),
       MAX(p.created_at)
FROM photos p
WHERE p.removed_from_index_at IS NULL
GROUP BY p.creator_id
ON DUPLICATE KEY UPDATE
  media_count = VALUES(media_count),
  photo_count = VALUES(photo_count),
  video_count = VALUES(video_count),
  engaged_count = VALUES(engaged_count),
  last_content_at = VALUES(last_content_at);

UNLOCK TABLES;
