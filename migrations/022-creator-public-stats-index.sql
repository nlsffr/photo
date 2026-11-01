-- Cover the existing public creator aggregate without changing its filters or
-- counters. InnoDB also stores the primary key (id) in this secondary index,
-- covering COUNT(p.id). Existing indexes used to sort media remain in place.
--
-- Run on a dedicated connection after comparing EXPLAIN for the unchanged
-- getCreatorCollectionContext query. If this index name already exists, verify
-- its ordered columns with SHOW INDEX: IF NOT EXISTS only checks the name.
-- Explicit online options fail rather than fall back to a table copy or an
-- exclusive DML lock. Brief metadata locks are still needed; bound their wait.
SET SESSION lock_wait_timeout = 5;

CREATE INDEX IF NOT EXISTS idx_photos_creator_public_stats
  ON photos (
    creator_id,
    is_hidden,
    removed_from_index_at,
    type,
    source_views_count,
    source_likes_count,
    views_count,
    likes_count,
    local_views_count
  )
  ALGORITHM=INPLACE
  LOCK=NONE;

-- Verify the unchanged query selects this index with "Using index", preserves
-- aggregate results, and completes within its existing five-second budget.
-- DDL commits implicitly. Optional manual rollback, after reviewing load:
-- ALTER TABLE photos DROP INDEX idx_photos_creator_public_stats,
--   ALGORITHM=INPLACE, LOCK=NONE;
