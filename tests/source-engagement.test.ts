import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadEngagement() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/source-engagement.ts");
  } catch (error) {
    assert.fail(`source engagement helpers are unavailable: ${String(error)}`);
  }
}

test("legacy rows keep their existing source ranking values during rollout", async () => {
  const { normalizeEngagement } = await loadEngagement();

  assert.deepEqual(
    normalizeEngagement({ legacyViews: 12_345, legacyLikes: 678 }),
    {
      sourceViews: 12_345,
      sourceLikes: 678,
      localViews: 0,
      views: 12_345,
      likes: 678,
    },
  );
});

test("migration stays online-safe while a replayable worker backfills in batches", async () => {
  const sql = await readFile(
    new URL("../migrations/015-source-engagement.sql", import.meta.url),
    "utf8",
  );
  const backfill = await readFile(
    new URL("../ops/backfill-source-engagement.mjs", import.meta.url),
    "utf8",
  );

  assert.match(sql, /source_views_count BIGINT UNSIGNED NULL DEFAULT NULL/);
  assert.match(sql, /source_likes_count BIGINT UNSIGNED NULL DEFAULT NULL/);
  assert.match(sql, /local_views_count BIGINT UNSIGNED NOT NULL DEFAULT 0/);
  assert.doesNotMatch(sql, /UPDATE\s+photos\s+p/i);
  assert.match(sql, /idx_photos_source_views_id[\s\S]*source_views_count DESC, id/);
  assert.match(sql, /idx_photos_source_likes_id[\s\S]*source_likes_count DESC, id/);
  assert.match(backfill, /FOR UPDATE/);
  assert.match(backfill, /source_views_count IS NULL/);
  assert.match(backfill, /BATCH_SIZE/);
  assert.match(backfill, /beginTransaction\(\)/);
  assert.match(backfill, /commit\(\)/);
  assert.match(backfill, /rollback\(\)/);
  assert.match(
    sql,
    /SET NEW\.views_count = COALESCE\(NEW\.source_views_count, 0\)[\s\S]*COALESCE\(NEW\.local_views_count, 0\)/,
  );
});

test("explicit source and local metrics are kept separate from compatibility totals", async () => {
  const { normalizeEngagement } = await loadEngagement();

  assert.deepEqual(
    normalizeEngagement({
      sourceViews: 900,
      sourceLikes: 80,
      localViews: 12,
      legacyViews: 50_000,
      legacyLikes: 4_000,
    }),
    {
      sourceViews: 900,
      sourceLikes: 80,
      localViews: 12,
      views: 912,
      likes: 80,
    },
  );
});

test("recording a local view cannot change imported source engagement", async () => {
  const { recordLocalPhotoView } = await loadEngagement();
  const state = {
    sourceViews: 500,
    sourceLikes: 25,
    localViews: 3,
    events: [] as Array<{ photoId: string; userId: string | null }>,
  };

  const connection = {
    async beginTransaction() {},
    async execute(sql: string, params: unknown[]) {
      if (/UPDATE photos SET local_views_count = COALESCE\(local_views_count, 0\) \+ 1/.test(sql)) {
        state.localViews += 1;
        return [{ affectedRows: 1 }];
      }
      if (/INSERT INTO media_views/.test(sql)) {
        state.events.push({
          photoId: String(params[0]),
          userId: params[1] == null ? null : String(params[1]),
        });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`unexpected write: ${sql}`);
    },
    async commit() {},
    async rollback() {},
    release() {},
  };
  const pool = { async getConnection() { return connection; } };

  await recordLocalPhotoView(pool, "photo-1", "user-1");

  assert.deepEqual(state, {
    sourceViews: 500,
    sourceLikes: 25,
    localViews: 4,
    events: [{ photoId: "photo-1", userId: "user-1" }],
  });
});
