-- A private publication stage is temporary. Existing hidden rows are not backfilled.
SET SESSION lock_wait_timeout = 5;
SET SESSION innodb_lock_wait_timeout = 5;

CREATE TABLE IF NOT EXISTS creator_bootstrap_staging (
  creator_id CHAR(36) NOT NULL PRIMARY KEY,
  CONSTRAINT fk_bootstrap_staging_cap
    FOREIGN KEY (creator_id) REFERENCES creator_import_caps(creator_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creator_bootstrap_staged_media (
  photo_id CHAR(36) NOT NULL PRIMARY KEY,
  creator_id CHAR(36) NOT NULL,
  CONSTRAINT fk_bootstrap_stage_photo
    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_bootstrap_stage_creator
    FOREIGN KEY (creator_id) REFERENCES creator_bootstrap_staging(creator_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

-- A second write to an already hidden row invalidates bootstrap's ownership of
-- that state. This includes an administrative UPDATE that sets is_hidden to 1
-- again without setting removed_from_index_at. Publication also clears markers.
CREATE TRIGGER IF NOT EXISTS trg_creators_bootstrap_stage_au
AFTER UPDATE ON creators
FOR EACH ROW
BEGIN
  IF OLD.is_hidden = 1 THEN
    DELETE FROM creator_bootstrap_staging WHERE creator_id = OLD.id;
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS trg_photos_bootstrap_stage_au
AFTER UPDATE ON photos
FOR EACH ROW
BEGIN
  IF OLD.is_hidden = 1 THEN
    DELETE FROM creator_bootstrap_staged_media WHERE photo_id = OLD.id;
  END IF;
END$$

DELIMITER ;
