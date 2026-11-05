-- Apply on a dedicated MariaDB connection before running capped creator code.
SET SESSION lock_wait_timeout = 5;
SET SESSION innodb_lock_wait_timeout = 5;

CREATE TABLE IF NOT EXISTS creator_import_caps (
  creator_id CHAR(36) NOT NULL,
  admitted TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (creator_id),
  CONSTRAINT chk_creator_import_cap CHECK (admitted <= 15),
  CONSTRAINT fk_creator_import_cap_creator
    FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

CREATE TRIGGER IF NOT EXISTS trg_photos_import_cap_ai
AFTER INSERT ON photos
FOR EACH ROW
BEGIN
  DECLARE used_count INT DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET used_count = NULL;
  SELECT admitted INTO used_count
    FROM creator_import_caps WHERE creator_id = NEW.creator_id FOR UPDATE;
  IF used_count >= 15 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'creator_import_cap_reached';
  ELSEIF used_count IS NOT NULL THEN
    UPDATE creator_import_caps SET admitted = admitted + 1 WHERE creator_id = NEW.creator_id;
  END IF;
END$$

CREATE TRIGGER IF NOT EXISTS trg_photos_import_cap_au
AFTER UPDATE ON photos
FOR EACH ROW
BEGIN
  DECLARE used_count INT DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET used_count = NULL;
  IF NOT (OLD.creator_id <=> NEW.creator_id) THEN
    SELECT admitted INTO used_count
      FROM creator_import_caps WHERE creator_id = NEW.creator_id FOR UPDATE;
    IF used_count >= 15 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'creator_import_cap_reached';
    ELSEIF used_count IS NOT NULL THEN
      UPDATE creator_import_caps SET admitted = admitted + 1 WHERE creator_id = NEW.creator_id;
    END IF;
  END IF;
END$$

DELIMITER ;
