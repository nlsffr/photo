-- Keep model/profile aggregates aligned with publicly active media only.
-- Migration 013 counted rows later removed from the index, leaving dead cards.

DROP TRIGGER IF EXISTS trg_photos_stats_ai;
DROP TRIGGER IF EXISTS trg_photos_stats_au;
DROP TRIGGER IF EXISTS trg_photos_stats_ad;

DELIMITER $$

CREATE TRIGGER trg_photos_stats_ai
AFTER INSERT ON photos
FOR EACH ROW
BEGIN
  IF NEW.removed_from_index_at IS NULL THEN
    INSERT INTO creator_media_stats (
      creator_id,
      photo_count,
      total_views,
      total_likes
    ) VALUES (
      NEW.creator_id,
      1,
      COALESCE(NEW.views_count, 0),
      COALESCE(NEW.likes_count, 0)
    )
    ON DUPLICATE KEY UPDATE
      photo_count = photo_count + 1,
      total_views = GREATEST(0, total_views + COALESCE(NEW.views_count, 0)),
      total_likes = GREATEST(0, total_likes + COALESCE(NEW.likes_count, 0));
  END IF;
END$$

CREATE TRIGGER trg_photos_stats_au
AFTER UPDATE ON photos
FOR EACH ROW
BEGIN
  IF OLD.creator_id = NEW.creator_id THEN
    IF OLD.removed_from_index_at IS NULL AND NEW.removed_from_index_at IS NULL THEN
      UPDATE creator_media_stats
      SET total_views = GREATEST(
            0,
            total_views + COALESCE(NEW.views_count, 0) - COALESCE(OLD.views_count, 0)
          ),
          total_likes = GREATEST(
            0,
            total_likes + COALESCE(NEW.likes_count, 0) - COALESCE(OLD.likes_count, 0)
          )
      WHERE creator_id = NEW.creator_id;
    ELSEIF OLD.removed_from_index_at IS NULL AND NEW.removed_from_index_at IS NOT NULL THEN
      UPDATE creator_media_stats
      SET photo_count = GREATEST(0, photo_count - 1),
          total_views = GREATEST(0, total_views - COALESCE(OLD.views_count, 0)),
          total_likes = GREATEST(0, total_likes - COALESCE(OLD.likes_count, 0))
      WHERE creator_id = OLD.creator_id;
    ELSEIF OLD.removed_from_index_at IS NOT NULL AND NEW.removed_from_index_at IS NULL THEN
      INSERT INTO creator_media_stats (
        creator_id,
        photo_count,
        total_views,
        total_likes
      ) VALUES (
        NEW.creator_id,
        1,
        COALESCE(NEW.views_count, 0),
        COALESCE(NEW.likes_count, 0)
      )
      ON DUPLICATE KEY UPDATE
        photo_count = photo_count + 1,
        total_views = GREATEST(0, total_views + COALESCE(NEW.views_count, 0)),
        total_likes = GREATEST(0, total_likes + COALESCE(NEW.likes_count, 0));
    END IF;
  ELSE
    IF OLD.removed_from_index_at IS NULL THEN
      UPDATE creator_media_stats
      SET photo_count = GREATEST(0, photo_count - 1),
          total_views = GREATEST(0, total_views - COALESCE(OLD.views_count, 0)),
          total_likes = GREATEST(0, total_likes - COALESCE(OLD.likes_count, 0))
      WHERE creator_id = OLD.creator_id;
    END IF;

    IF NEW.removed_from_index_at IS NULL THEN
      INSERT INTO creator_media_stats (
        creator_id,
        photo_count,
        total_views,
        total_likes
      ) VALUES (
        NEW.creator_id,
        1,
        COALESCE(NEW.views_count, 0),
        COALESCE(NEW.likes_count, 0)
      )
      ON DUPLICATE KEY UPDATE
        photo_count = photo_count + 1,
        total_views = GREATEST(0, total_views + COALESCE(NEW.views_count, 0)),
        total_likes = GREATEST(0, total_likes + COALESCE(NEW.likes_count, 0));
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_photos_stats_ad
AFTER DELETE ON photos
FOR EACH ROW
BEGIN
  IF OLD.removed_from_index_at IS NULL THEN
    UPDATE creator_media_stats
    SET photo_count = GREATEST(0, photo_count - 1),
        total_views = GREATEST(0, total_views - COALESCE(OLD.views_count, 0)),
        total_likes = GREATEST(0, total_likes - COALESCE(OLD.likes_count, 0))
    WHERE creator_id = OLD.creator_id;
  END IF;
END$$

DELIMITER ;

-- Reconcile every existing aggregate after the trigger semantics change.
UPDATE creator_media_stats stats
LEFT JOIN (
  SELECT creator_id,
         COUNT(*) AS photo_count,
         COALESCE(SUM(views_count), 0) AS total_views,
         COALESCE(SUM(likes_count), 0) AS total_likes
  FROM photos
  WHERE removed_from_index_at IS NULL
  GROUP BY creator_id
) active ON active.creator_id = stats.creator_id
SET stats.photo_count = COALESCE(active.photo_count, 0),
    stats.total_views = COALESCE(active.total_views, 0),
    stats.total_likes = COALESCE(active.total_likes, 0);

INSERT INTO creator_media_stats (
  creator_id,
  photo_count,
  total_views,
  total_likes
)
SELECT creator_id,
       COUNT(*),
       COALESCE(SUM(views_count), 0),
       COALESCE(SUM(likes_count), 0)
FROM photos
WHERE removed_from_index_at IS NULL
GROUP BY creator_id
ON DUPLICATE KEY UPDATE
  photo_count = VALUES(photo_count),
  total_views = VALUES(total_views),
  total_likes = VALUES(total_likes);
