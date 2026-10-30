CREATE TABLE IF NOT EXISTS creator_media_stats (
  creator_id CHAR(36) NOT NULL,
  photo_count BIGINT NOT NULL DEFAULT 0,
  total_views BIGINT NOT NULL DEFAULT 0,
  total_likes BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (creator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
GROUP BY creator_id
ON DUPLICATE KEY UPDATE
  photo_count = VALUES(photo_count),
  total_views = VALUES(total_views),
  total_likes = VALUES(total_likes);

DROP TRIGGER IF EXISTS trg_photos_stats_ai;
DROP TRIGGER IF EXISTS trg_photos_stats_au;
DROP TRIGGER IF EXISTS trg_photos_stats_ad;

DELIMITER $$

CREATE TRIGGER trg_photos_stats_ai
AFTER INSERT ON photos
FOR EACH ROW
BEGIN
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
END$$

CREATE TRIGGER trg_photos_stats_au
AFTER UPDATE ON photos
FOR EACH ROW
BEGIN
  IF OLD.creator_id = NEW.creator_id THEN
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
  ELSE
    UPDATE creator_media_stats
    SET photo_count = GREATEST(0, photo_count - 1),
        total_views = GREATEST(0, total_views - COALESCE(OLD.views_count, 0)),
        total_likes = GREATEST(0, total_likes - COALESCE(OLD.likes_count, 0))
    WHERE creator_id = OLD.creator_id;

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

CREATE TRIGGER trg_photos_stats_ad
AFTER DELETE ON photos
FOR EACH ROW
BEGIN
  UPDATE creator_media_stats
  SET photo_count = GREATEST(0, photo_count - 1),
      total_views = GREATEST(0, total_views - COALESCE(OLD.views_count, 0)),
      total_likes = GREATEST(0, total_likes - COALESCE(OLD.likes_count, 0))
  WHERE creator_id = OLD.creator_id;
END$$

DELIMITER ;

-- Reconcile writes that may have landed while the triggers were installed.
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
GROUP BY creator_id
ON DUPLICATE KEY UPDATE
  photo_count = VALUES(photo_count),
  total_views = VALUES(total_views),
  total_likes = VALUES(total_likes);
