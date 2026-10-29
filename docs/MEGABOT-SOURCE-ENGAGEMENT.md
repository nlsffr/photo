# MegaBot source-engagement rollout

This procedure deliberately contains no credentials and does not stop, restart,
rename, move, disable, or delete any running bot. The four current MegaBot
processes keep running; DMCA processes remain untouched. Apply it on the host
only after the application commit and database migration are available.

## Order of operations

1. Back up the database using the existing operator process.
2. Apply `migrations/015-source-engagement.sql`. This migration only adds the
   nullable source columns, local counter, compatibility triggers, and indexes;
   it does **not** update all 274,767 photos in one transaction. `NULL` is the
   replayable marker for a row that has not been backfilled yet. Legacy writes
   continue unchanged on pending rows. On migrated rows, an exact legacy
   `views_count + 1` is attributed to the old application/local counter; other
   legacy values are treated as fresh upstream MegaBot values. A rare upstream
   change that is exactly `+1` can therefore be temporarily attributed locally,
   but source/local totals remain internally consistent and the local ranking
   boost is capped.
3. Copy `ops/patch-megabot-source-engagement.py` to the host and preview its
   identifier-only replacement plan before applying it. The preview never
   echoes source lines, even if a credential shares a line with the SQL:

   ```sh
   python3 /path/to/patch-megabot-source-engagement.py /opt/megabot/megabot.py
   ```

   The patcher refuses to proceed unless it finds exactly one expected column
   list and one expected assignment for each counter. If it refuses, stop and
   inspect the current `INSERT INTO photos` / `ON DUPLICATE KEY UPDATE`
   statement. Do not alter its values tuple, connection settings, credentials,
   timers, or process configuration.

4. Preserve a local backup, apply the patch, and compile-check the worker file:

   ```sh
   python3 /path/to/patch-megabot-source-engagement.py \
     /opt/megabot/megabot.py --write
   python3 -m py_compile /opt/megabot/megabot.py
   ```

   Do **not** stop or restart the four running processes. Python has already
   loaded their current code; the patched file is used at their next natural
   start. Until then the compatibility trigger accepts their legacy writes.

5. Build/load the new production image, but do not recreate the running app
   container yet. The new image contains the script and its locked `mysql2`
   runtime. Run one 500-row canary in a one-off container using the existing
   app service environment (the script reads its `DATABASE_URL`; never copy it
   into the command or source):

   ```sh
   docker compose -f docker-compose.vps.yml run --rm --no-deps app \
     node ops/backfill-source-engagement.mjs \
       --batch-size 500 --pause-ms 100 --max-batches 1
   ```

   Each batch locks at most 500 `photos` rows, reads `media_views` through its
   `photo_id` index, commits, then pauses. It is safe to interrupt and rerun:
   only rows whose source counter is still `NULL` are selected. After checking
   database latency and locks, run without `--max-batches`:

   ```sh
   docker compose -f docker-compose.vps.yml run --rm --no-deps app \
     node ops/backfill-source-engagement.mjs --batch-size 500 --pause-ms 100
   ```

   With the current 274,767 photos this is about 550 short transactions, not
   one global `UPDATE JOIN` over 274,767 photos and 459,301 view events.

6. Require zero pending rows before deploying/restarting the new application:

   ```sql
   SELECT COUNT(*) AS pending
   FROM photos
   WHERE source_views_count IS NULL OR source_likes_count IS NULL;
   ```

   Do not enable the discovery homepage while `pending` is non-zero: nullable
   rows intentionally retain their legacy counters but are not candidates for
   the new ordered source indexes.

7. Deploy/recreate only the application container, then confirm new local
   views use `local_views_count`. Do not restart MegaBot merely to activate its
   patched source-column upsert; allow the existing processes to reach their
   next natural restart.

## Transactional database smoke test

Run this after migration 015 and before restarting the application. It creates
no persistent row because the transaction is rolled back.

```sql
START TRANSACTION;
SET @creator_id = (SELECT id FROM creators ORDER BY id LIMIT 1);
SET @photo_id = UUID();

INSERT INTO photos (
  id, creator_id, title, image_url, type, width, height,
  source_views_count, source_likes_count
) VALUES (
  @photo_id, @creator_id, 'source-engagement-smoke',
  'https://invalid.example/source-engagement-smoke.jpg',
  'photo', 1, 1, 120, 9
);

SELECT source_views_count, source_likes_count, local_views_count,
       views_count, likes_count
FROM photos
WHERE id = @photo_id;

UPDATE photos
SET local_views_count = local_views_count + 1
WHERE id = @photo_id;

SELECT source_views_count, source_likes_count, local_views_count,
       views_count, likes_count
FROM photos
WHERE id = @photo_id;

ROLLBACK;
```

Expected first result: `120, 9, 0, 120, 9`. Expected second result:
`120, 9, 1, 121, 9`. The source counters must not change.

## Post-deployment checks

- Confirm the existing MegaBot process is healthy using its current supervisor.
- Confirm recently ingested or refreshed rows populate
  `source_views_count`/`source_likes_count`.
- Confirm a site view increments only `local_views_count` directly; the trigger
  updates legacy `views_count` for compatibility.
- Run the discovery `EXPLAIN` from the deployment checklist and verify all
  three candidate arms use `idx_photos_source_views_id`,
  `idx_photos_source_likes_id`, and `idx_photos_created_id` respectively.

## Production discovery plan check

Run the read-only plan below after migration 015. Use `ANALYZE FORMAT=JSON`
instead of `EXPLAIN FORMAT=JSON` only on a replica or during a quiet window if
actual timing is required, because `ANALYZE` executes the query.

```sql
EXPLAIN FORMAT=JSON
SELECT p.id
FROM (
  (SELECT pv.id
   FROM photos pv FORCE INDEX (idx_photos_source_views_id)
   STRAIGHT_JOIN creators cv ON cv.id = pv.creator_id
   WHERE pv.removed_from_index_at IS NULL
     AND cv.removed_from_index_at IS NULL
   ORDER BY pv.source_views_count DESC, pv.id ASC
   LIMIT 400)
  UNION DISTINCT
  (SELECT pl.id
   FROM photos pl FORCE INDEX (idx_photos_source_likes_id)
   STRAIGHT_JOIN creators cl ON cl.id = pl.creator_id
   WHERE pl.removed_from_index_at IS NULL
     AND cl.removed_from_index_at IS NULL
   ORDER BY pl.source_likes_count DESC, pl.id ASC
   LIMIT 400)
  UNION DISTINCT
  (SELECT pr.id
   FROM photos pr FORCE INDEX (idx_photos_created_id)
   STRAIGHT_JOIN creators cr ON cr.id = pr.creator_id
   WHERE pr.removed_from_index_at IS NULL
     AND cr.removed_from_index_at IS NULL
   ORDER BY pr.created_at DESC, pr.id ASC
   LIMIT 400)
) candidates
STRAIGHT_JOIN photos p ON p.id = candidates.id
STRAIGHT_JOIN creators c ON c.id = p.creator_id
WHERE p.removed_from_index_at IS NULL
  AND c.removed_from_index_at IS NULL
ORDER BY p.id ASC
LIMIT 1200;
```

Accept the plan only when each union arm uses its named ordered index, the
materialized candidate set is bounded to at most 1,200 IDs, and joins back to
`photos` and `creators` use their primary keys. A filesort on only that bounded
derived set is acceptable; a full `photos` scan or filesort is not. Repeat the
check with representative type/tag/creator filters and verify those predicates,
plus both photo and creator removal predicates, appear before each arm's
`LIMIT 400` as well as in the outer safety layer.
