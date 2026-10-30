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
    -- Atomic deltas serialize on the creator's summary row and cannot replace
    -- another transaction's committed contribution with an older snapshot.
    IF OLD.removed_from_index_at IS NULL THEN
      UPDATE creator_collection_stats
      SET media_count = IF(media_count > 0, media_count - 1, 0),
          photo_count = IF(
            OLD.type = 'photo' AND photo_count > 0,
            photo_count - 1,
            photo_count
          ),
          video_count = IF(
            OLD.type = 'video' AND video_count > 0,
            video_count - 1,
            video_count
          ),
          engaged_count = IF(
            engaged_count > 0
            AND (
              COALESCE(OLD.source_views_count, 0) > 0
              OR COALESCE(OLD.source_likes_count, 0) > 0
            ),
            engaged_count - 1,
            engaged_count
          )
      WHERE creator_id = OLD.creator_id;
    END IF;

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

    -- Counts stay O(1). Only a change that can invalidate the previous maximum
    -- needs the small per-creator MAX lookup.
    IF OLD.removed_from_index_at IS NULL
       AND (
         NEW.removed_from_index_at IS NOT NULL
         OR NOT (OLD.creator_id <=> NEW.creator_id)
         OR NOT (OLD.created_at <=> NEW.created_at)
       ) THEN
      UPDATE creator_collection_stats
      SET last_content_at = (
        SELECT MAX(p.created_at)
        FROM photos p
        WHERE p.creator_id = OLD.creator_id
          AND p.removed_from_index_at IS NULL
      )
      WHERE creator_id = OLD.creator_id;
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_photos_collection_stats_ad
AFTER DELETE ON photos
FOR EACH ROW
BEGIN
  IF OLD.removed_from_index_at IS NULL THEN
    UPDATE creator_collection_stats
    SET media_count = IF(media_count > 0, media_count - 1, 0),
        photo_count = IF(
          OLD.type = 'photo' AND photo_count > 0,
          photo_count - 1,
          photo_count
        ),
        video_count = IF(
          OLD.type = 'video' AND video_count > 0,
          video_count - 1,
          video_count
        ),
        engaged_count = IF(
          engaged_count > 0
          AND (
            COALESCE(OLD.source_views_count, 0) > 0
            OR COALESCE(OLD.source_likes_count, 0) > 0
          ),
          engaged_count - 1,
          engaged_count
        )
    WHERE creator_id = OLD.creator_id;

    UPDATE creator_collection_stats
    SET last_content_at = (
      SELECT MAX(p.created_at)
      FROM photos p
      WHERE p.creator_id = OLD.creator_id
        AND p.removed_from_index_at IS NULL
    )
    WHERE creator_id = OLD.creator_id;
  END IF;
END$$

DELIMITER ;

-- Reconcile the complete public catalog after the online triggers exist.
-- This is an explicit bounded maintenance section: writers can wait for at most
-- the measured backfill window, and the migration aborts rather than holding an
-- unbounded catalog lock.
SET SESSION lock_wait_timeout = 5;
SET SESSION innodb_lock_wait_timeout = 5;
LOCK TABLES photos AS p READ, creators READ, creator_collection_stats WRITE;

SET STATEMENT max_statement_time=15 FOR
UPDATE creator_collection_stats
SET media_count = 0,
    photo_count = 0,
    video_count = 0,
    engaged_count = 0,
    last_content_at = NULL;

SET STATEMENT max_statement_time=15 FOR
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
