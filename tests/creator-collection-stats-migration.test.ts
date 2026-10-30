import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("creator collection summary migration maintains only public eligibility counters", async () => {
  const sql = await readFile(
    new URL("../migrations/019-creator-collection-stats.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_collection_stats/);
  for (const column of [
    "media_count",
    "photo_count",
    "video_count",
    "engaged_count",
    "last_content_at",
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`));
  }
  assert.match(sql, /WHERE p\.removed_from_index_at IS NULL/);
  assert.match(sql, /SUM\(p\.type = 'photo'\)/);
  assert.match(sql, /SUM\(p\.type = 'video'\)/);
  assert.match(sql, /p\.source_views_count[\s\S]*p\.source_likes_count/);
  assert.match(sql, /MAX\(p\.created_at\)/);
  assert.doesNotMatch(sql, /local_views_count/);
  assert.match(
    sql,
    /LOCK TABLES photos AS p READ, creators READ, creator_collection_stats WRITE/,
  );
  assert.match(sql, /UNLOCK TABLES/);
});

test("creator collection counters ignore ordinary view writes and reconcile structural changes", async () => {
  const sql = await readFile(
    new URL("../migrations/019-creator-collection-stats.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /CREATE TRIGGER trg_photos_collection_stats_ai/);
  assert.match(sql, /CREATE TRIGGER trg_photos_collection_stats_au/);
  assert.match(sql, /CREATE TRIGGER trg_photos_collection_stats_ad/);
  assert.match(sql, /OLD\.creator_id <=> NEW\.creator_id/);
  assert.match(sql, /OLD\.removed_from_index_at <=> NEW\.removed_from_index_at/);
  assert.match(sql, /OLD\.type <=> NEW\.type/);
  assert.match(sql, /OLD\.created_at <=> NEW\.created_at/);
  assert.match(sql, /OLD\.source_views_count[\s\S]*NEW\.source_views_count/);
  assert.match(sql, /OLD\.source_likes_count[\s\S]*NEW\.source_likes_count/);
  assert.ok((sql.match(/ON DUPLICATE KEY UPDATE/g) ?? []).length >= 4);
});
