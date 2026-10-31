import assert from "node:assert/strict";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sitemapBuckets = 64;
const maxCreatorsPerSitemap = 24_000;

function normalized(row) {
  return {
    mediaCount: Number(row.media_count) || 0,
    photoCount: Number(row.photo_count) || 0,
    videoCount: Number(row.video_count) || 0,
    engagedCount: Number(row.engaged_count) || 0,
    lastContentAt: row.last_content_at
      ? new Date(row.last_content_at).toISOString()
      : null,
  };
}

const connection = await mysql.createConnection(databaseUrl);
try {
  await connection.query("SET TRANSACTION READ ONLY");
  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
  const [storedRows] = await connection.query(
    `SELECT creator_id, media_count, photo_count, video_count,
            engaged_count, last_content_at
     FROM creator_collection_stats
     ORDER BY creator_id`,
  );
  const [rawRows] = await connection.query(
    `SELECT p.creator_id,
            COUNT(*) AS media_count,
            COALESCE(SUM(p.type = 'photo'), 0) AS photo_count,
            COALESCE(SUM(p.type = 'video'), 0) AS video_count,
            COALESCE(SUM(
              COALESCE(p.source_views_count, 0) > 0
              OR COALESCE(p.source_likes_count, 0) > 0
            ), 0) AS engaged_count,
            MAX(p.created_at) AS last_content_at
     FROM photos p
     WHERE p.removed_from_index_at IS NULL AND p.is_hidden = 0
     GROUP BY p.creator_id
     ORDER BY p.creator_id`,
  );
  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS active_creators,
            COALESCE(SUM(stats.media_count >= 1), 0) AS overview,
            COALESCE(SUM(stats.photo_count >= 12), 0) AS photos,
            COALESCE(SUM(stats.video_count >= 4), 0) AS videos,
            COALESCE(SUM(
              stats.media_count >= 24 AND stats.engaged_count >= 8
            ), 0) AS popular
     FROM creators c
     LEFT JOIN creator_collection_stats stats ON stats.creator_id = c.id
     WHERE c.removed_from_index_at IS NULL AND c.is_hidden = 0`,
  );
  const [bucketRows] = await connection.query(
    `SELECT MOD(CRC32(c.id), ?) AS bucket,
            COALESCE(SUM(stats.media_count >= 1), 0) AS overview,
            COALESCE(SUM(stats.photo_count >= 12), 0) AS photos,
            COALESCE(SUM(stats.video_count >= 4), 0) AS videos,
            COALESCE(SUM(
              stats.media_count >= 24 AND stats.engaged_count >= 8
            ), 0) AS popular
     FROM creators c
     LEFT JOIN creator_collection_stats stats ON stats.creator_id = c.id
     WHERE c.removed_from_index_at IS NULL AND c.is_hidden = 0
     GROUP BY MOD(CRC32(c.id), ?)
     ORDER BY bucket`,
    [sitemapBuckets, sitemapBuckets],
  );
  await connection.commit();

  const stored = new Map(
    storedRows.map((row) => [String(row.creator_id), normalized(row)]),
  );
  const mismatches = [];
  for (const raw of rawRows) {
    const creatorId = String(raw.creator_id);
    const actual = stored.get(creatorId);
    const expected = normalized(raw);
    if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) {
      mismatches.push({ creatorId, actual, expected });
    }
    stored.delete(creatorId);
  }
  for (const [creatorId, actual] of stored) {
    const expected = {
      mediaCount: 0,
      photoCount: 0,
      videoCount: 0,
      engagedCount: 0,
      lastContentAt: null,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      mismatches.push({ creatorId, actual, expected });
    }
  }

  assert.equal(
    mismatches.length,
    0,
    `creator collection stats differ from public media: ${JSON.stringify(mismatches.slice(0, 5))}`,
  );
  const bucketMaxima = { overview: 0, photos: 0, videos: 0, popular: 0 };
  for (const row of bucketRows) {
    const bucket = Number(row.bucket);
    assert.ok(
      Number.isInteger(bucket) && bucket >= 0 && bucket < sitemapBuckets,
      `invalid creator sitemap bucket: ${row.bucket}`,
    );
    for (const collection of Object.keys(bucketMaxima)) {
      bucketMaxima[collection] = Math.max(
        bucketMaxima[collection],
        Number(row[collection]),
      );
    }
  }
  for (const [collection, count] of Object.entries(bucketMaxima)) {
    assert.ok(
      count <= maxCreatorsPerSitemap,
      `${collection} bucket exceeds creator sitemap capacity: ${count} > ${maxCreatorsPerSitemap}`,
    );
  }
  const counts = countRows[0];
  console.log(JSON.stringify({
    ok: true,
    storedRows: storedRows.length,
    rawRows: rawRows.length,
    activeCreators: Number(counts.active_creators),
    overview: Number(counts.overview),
    photos: Number(counts.photos),
    videos: Number(counts.videos),
    popular: Number(counts.popular),
    sitemapBuckets,
    maxCreatorsPerBucket: bucketMaxima,
  }));
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
