-- Additive and backward compatible; never backfill from a referrer or language.
ALTER TABLE analytics_daily_visitors
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN IF NOT EXISTS country_observed_at DATETIME(6) NULL,
  ALGORITHM=INSTANT;
