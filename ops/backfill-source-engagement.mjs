#!/usr/bin/env node

import mysql from "mysql2/promise";

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 2_000;

if (process.argv.includes("--help")) {
  console.log(
    "Usage: node ops/backfill-source-engagement.mjs " +
      "[--batch-size 500] [--pause-ms 100] [--max-batches 1]",
  );
  process.exit(0);
}

function positiveInteger(raw, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.trunc(value), maximum);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function metric(value) {
  try {
    const parsed = BigInt(value ?? 0);
    return parsed > 0n ? parsed : 0n;
  } catch {
    return 0n;
  }
}

function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(", ");
}

function cases(rows, valueFor) {
  return {
    sql: rows.map(() => "WHEN ? THEN ?").join(" "),
    params: rows.flatMap((row) => [row.id, String(valueFor(row))]),
  };
}

const batchSize = positiveInteger(
  option("--batch-size") ?? process.env.ENGAGEMENT_BACKFILL_BATCH_SIZE,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
);
const pauseMs = positiveInteger(
  option("--pause-ms") ?? process.env.ENGAGEMENT_BACKFILL_PAUSE_MS,
  100,
  60_000,
);
const maxBatches = positiveInteger(option("--max-batches"), Infinity);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required; no credential is stored by this script.");
  process.exit(2);
}

const connection = await mysql.createConnection(databaseUrl);

let batches = 0;
let migrated = 0;
let afterId = "";

try {
  while (batches < maxBatches) {
    await connection.beginTransaction();
    try {
      const [pending] = await connection.execute(
        `SELECT id, views_count, likes_count,
                source_views_count, source_likes_count, local_views_count
         FROM photos
         WHERE id > ?
           AND (source_views_count IS NULL OR source_likes_count IS NULL)
         ORDER BY id ASC
         LIMIT ?
         FOR UPDATE`,
        [afterId, batchSize],
      );

      if (pending.length === 0) {
        await connection.commit();
        break;
      }

      const ids = pending.map((row) => row.id);
      const [viewRows] = await connection.execute(
        `SELECT photo_id, COUNT(*) AS local_views
         FROM media_views
         WHERE photo_id IN (${placeholders(ids.length)})
         GROUP BY photo_id`,
        ids,
      );
      const localByPhoto = new Map(
        viewRows.map((row) => [String(row.photo_id), metric(row.local_views)]),
      );
      const values = pending.map((row) => {
        const legacyViews = metric(row.views_count);
        const alreadyHasSource = row.source_views_count !== null;
        const historicalLocal = localByPhoto.get(String(row.id)) ?? 0n;
        const localViews = alreadyHasSource
          ? metric(row.local_views_count)
          : historicalLocal < legacyViews
            ? historicalLocal
            : legacyViews;
        return {
          id: String(row.id),
          sourceViews: alreadyHasSource
            ? metric(row.source_views_count)
            : legacyViews,
          sourceLikes: row.source_likes_count !== null
            ? metric(row.source_likes_count)
            : metric(row.likes_count),
          localViews,
        };
      });

      const sourceViews = cases(values, (row) => row.sourceViews);
      const sourceLikes = cases(values, (row) => row.sourceLikes);
      const localViews = cases(values, (row) => row.localViews);
      await connection.execute(
        `UPDATE photos
         SET source_views_count = CASE id ${sourceViews.sql} ELSE source_views_count END,
             source_likes_count = CASE id ${sourceLikes.sql} ELSE source_likes_count END,
             local_views_count = CASE id ${localViews.sql} ELSE local_views_count END
         WHERE id IN (${placeholders(values.length)})
           AND (source_views_count IS NULL OR source_likes_count IS NULL)`,
        [
          ...sourceViews.params,
          ...sourceLikes.params,
          ...localViews.params,
          ...values.map((row) => row.id),
        ],
      );
      await connection.commit();

      afterId = String(pending[pending.length - 1].id);
      batches += 1;
      migrated += pending.length;
      console.log(`source engagement backfill: ${migrated} rows (${batches} batches)`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    if (pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }

  const [[remaining]] = await connection.execute(
    `SELECT COUNT(*) AS pending
     FROM photos
     WHERE source_views_count IS NULL OR source_likes_count IS NULL`,
  );
  const pendingCount = Number(remaining.pending);
  if (pendingCount === 0) {
    await connection.query("ANALYZE TABLE photos");
  }
  console.log(
    `source engagement backfill ${pendingCount === 0 ? "complete" : "stopped"}; ` +
      `pending=${pendingCount}`,
  );
} finally {
  await connection.end();
}
