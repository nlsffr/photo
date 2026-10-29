-- Split imported/source popularity from first-party site views.
-- Legacy counters remain synchronized for older readers and host workers.

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS source_views_count BIGINT UNSIGNED NULL DEFAULT NULL AFTER views_count,
  ADD COLUMN IF NOT EXISTS source_likes_count BIGINT UNSIGNED NULL DEFAULT NULL AFTER likes_count,
  ADD COLUMN IF NOT EXISTS local_views_count BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER source_views_count;

DROP TRIGGER IF EXISTS trg_photos_engagement_bi;
DROP TRIGGER IF EXISTS trg_photos_engagement_bu;

DELIMITER $$

CREATE TRIGGER trg_photos_engagement_bi
BEFORE INSERT ON photos
FOR EACH ROW
BEGIN
  IF NEW.source_views_count IS NULL THEN
    SET NEW.source_views_count = COALESCE(NEW.views_count, 0);
  END IF;
  IF NEW.source_likes_count IS NULL THEN
    SET NEW.source_likes_count = COALESCE(NEW.likes_count, 0);
  END IF;
  SET NEW.local_views_count = COALESCE(NEW.local_views_count, 0);
  SET NEW.views_count = COALESCE(NEW.source_views_count, 0)
                      + COALESCE(NEW.local_views_count, 0);
  SET NEW.likes_count = COALESCE(NEW.source_likes_count, 0);
END$$

CREATE TRIGGER trg_photos_engagement_bu
BEFORE UPDATE ON photos
FOR EACH ROW
BEGIN
  SET NEW.local_views_count = COALESCE(NEW.local_views_count, 0);

  -- NULL marks a row that the replayable batch worker has not migrated yet.
  -- Legacy writers may keep updating views_count while it is pending.
  IF NEW.source_views_count IS NOT NULL THEN
    -- During rollout the old application increments the legacy total by one.
    -- Once the ingestion worker is patched, preserve that narrow compatibility
    -- path by attributing the increment to the local counter.
    IF OLD.source_views_count IS NOT NULL
       AND NEW.source_views_count = OLD.source_views_count
       AND NEW.local_views_count = OLD.local_views_count
       AND NEW.views_count = OLD.views_count + 1 THEN
      SET NEW.local_views_count = OLD.local_views_count + 1;
    ELSEIF OLD.source_views_count IS NOT NULL
       AND NEW.source_views_count = OLD.source_views_count
       AND NEW.local_views_count = OLD.local_views_count
       AND NEW.views_count <> OLD.views_count THEN
      -- Legacy MegaBot writes its upstream source value into views_count.
      SET NEW.source_views_count = GREATEST(COALESCE(NEW.views_count, 0), 0);
    END IF;
    SET NEW.views_count = COALESCE(NEW.source_views_count, 0)
                        + COALESCE(NEW.local_views_count, 0);
  END IF;

  IF NEW.source_likes_count IS NOT NULL
     AND OLD.source_likes_count IS NOT NULL
     AND NEW.source_likes_count = OLD.source_likes_count
     AND NEW.likes_count <> OLD.likes_count THEN
    SET NEW.source_likes_count = GREATEST(COALESCE(NEW.likes_count, 0), 0);
  END IF;
  IF NEW.source_likes_count IS NOT NULL THEN
    SET NEW.likes_count = COALESCE(NEW.source_likes_count, 0);
  END IF;
END$$

DELIMITER ;

CREATE INDEX IF NOT EXISTS idx_photos_source_views_id
  ON photos (source_views_count DESC, id);
CREATE INDEX IF NOT EXISTS idx_photos_source_likes_id
  ON photos (source_likes_count DESC, id);
