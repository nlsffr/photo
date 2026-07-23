-- Add 'pack' media type, item count, and external content link.

ALTER TABLE photos
  MODIFY COLUMN type ENUM('photo', 'video', 'pack') DEFAULT 'photo';

ALTER TABLE photos
  ADD COLUMN item_count INT NULL AFTER duration_sec,
  ADD COLUMN external_url VARCHAR(1000) NULL AFTER video_url;
