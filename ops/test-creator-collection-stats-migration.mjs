import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const migrationPath = process.argv[2];
if (!migrationPath) throw new Error("migration path is required");

const suffix = `${process.pid}_${Date.now().toString(36)}`;
const names = {
  creators: `ccs_test_creators_${suffix}`,
  photos: `ccs_test_photos_${suffix}`,
  stats: `ccs_test_stats_${suffix}`,
  insertTrigger: `ccs_test_ai_${suffix}`,
  updateTrigger: `ccs_test_au_${suffix}`,
  deleteTrigger: `ccs_test_ad_${suffix}`,
  foreignKey: `ccs_test_fk_${suffix}`,
};

function splitMigration(source) {
  const statements = [];
  let delimiter = ";";
  let buffer = "";
  for (const line of source.split(/\r?\n/)) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (directive) {
      assert.equal(buffer.trim(), "", "delimiter changed with pending SQL");
      delimiter = directive[1];
      continue;
    }
    buffer += `${line}\n`;
    const trimmed = buffer.trimEnd();
    if (!trimmed.endsWith(delimiter)) continue;
    const statement = trimmed.slice(0, -delimiter.length).trim();
    if (statement) statements.push(statement);
    buffer = "";
  }
  assert.equal(buffer.trim(), "", "unterminated SQL statement");
  return statements;
}

function isolatedMigration(source) {
  return source
    .replaceAll("trg_photos_collection_stats_ai", names.insertTrigger)
    .replaceAll("trg_photos_collection_stats_au", names.updateTrigger)
    .replaceAll("trg_photos_collection_stats_ad", names.deleteTrigger)
    .replaceAll("fk_creator_collection_stats_creator", names.foreignKey)
    .replace(/\bcreator_collection_stats\b/g, names.stats)
    .replace(/\bcreators\b/g, names.creators)
    .replace(/\bphotos\b/g, names.photos);
}

function numericSummary(row) {
  return {
    mediaCount: Number(row.media_count),
    photoCount: Number(row.photo_count),
    videoCount: Number(row.video_count),
    engagedCount: Number(row.engaged_count),
    lastContentAt: row.last_content_at
      ? new Date(row.last_content_at).toISOString()
      : null,
  };
}

const connection = await mysql.createConnection(databaseUrl);
const concurrentConnection = await mysql.createConnection(databaseUrl);

async function waitForBlockedUpdate(promise, label) {
  let settled = false;
  promise.finally(() => { settled = true; }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 75));
  assert.equal(settled, false, `${label} did not contend on the summary row`);
}

async function summary(creatorId) {
  const [rows] = await connection.query(
    `SELECT media_count, photo_count, video_count, engaged_count, last_content_at
     FROM \`${names.stats}\` WHERE creator_id = ?`,
    [creatorId],
  );
  return rows[0] ? numericSummary(rows[0]) : null;
}

async function cleanup() {
  await connection.query("UNLOCK TABLES").catch(() => undefined);
  await connection.query(`DROP TABLE IF EXISTS \`${names.stats}\``);
  await connection.query(`DROP TABLE IF EXISTS \`${names.photos}\``);
  await connection.query(`DROP TABLE IF EXISTS \`${names.creators}\``);
}

try {
  await connection.query(
    `CREATE TABLE \`${names.creators}\` (
       id CHAR(36) PRIMARY KEY,
       removed_from_index_at DATETIME NULL DEFAULT NULL
     ) ENGINE=InnoDB`,
  );
  await connection.query(
    `CREATE TABLE \`${names.photos}\` (
       id CHAR(36) PRIMARY KEY,
       creator_id CHAR(36) NOT NULL,
       type ENUM('photo', 'video', 'pack') NOT NULL DEFAULT 'photo',
       source_views_count BIGINT UNSIGNED NULL DEFAULT NULL,
       source_likes_count BIGINT UNSIGNED NULL DEFAULT NULL,
       local_views_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       removed_from_index_at DATETIME NULL DEFAULT NULL,
       INDEX idx_creator_created (creator_id, created_at),
       CONSTRAINT \`${names.photos}_creator_fk\`
         FOREIGN KEY (creator_id) REFERENCES \`${names.creators}\`(id) ON DELETE CASCADE
     ) ENGINE=InnoDB`,
  );

  const migration = isolatedMigration(await readFile(migrationPath, "utf8"));
  const migrationStatements = splitMigration(migration);
  for (const statement of migrationStatements) await connection.query(statement);

  await connection.query(
    `INSERT INTO \`${names.creators}\` (id) VALUES ('creator-1'), ('creator-2')`,
  );
  await connection.query(
    `INSERT INTO \`${names.photos}\`
       (id, creator_id, type, source_views_count, source_likes_count, created_at, removed_from_index_at)
     VALUES
       ('photo-1', 'creator-1', 'photo', 0, 0, '2026-10-30 08:00:00', NULL),
       ('photo-2', 'creator-1', 'video', 10, 0, '2026-10-30 09:00:00', NULL),
       ('photo-3', 'creator-1', 'photo', 10, 1, '2026-10-30 10:00:00', '2026-10-30 10:05:00')`,
  );
  assert.deepEqual(await summary("creator-1"), {
    mediaCount: 2, photoCount: 1, videoCount: 1, engagedCount: 1,
    lastContentAt: "2026-10-30T09:00:00.000Z",
  });

  await connection.query(
    `UPDATE \`${names.photos}\` SET removed_from_index_at = NULL WHERE id = 'photo-3'`,
  );
  assert.deepEqual(await summary("creator-1"), {
    mediaCount: 3, photoCount: 2, videoCount: 1, engagedCount: 2,
    lastContentAt: "2026-10-30T10:00:00.000Z",
  });

  await connection.query(
    `UPDATE \`${names.photos}\` SET type = 'video', source_views_count = 5 WHERE id = 'photo-1'`,
  );
  assert.deepEqual(await summary("creator-1"), {
    mediaCount: 3, photoCount: 1, videoCount: 2, engagedCount: 3,
    lastContentAt: "2026-10-30T10:00:00.000Z",
  });

  await connection.query(
    `UPDATE \`${names.photos}\` SET creator_id = 'creator-2' WHERE id = 'photo-2'`,
  );
  assert.deepEqual(await summary("creator-2"), {
    mediaCount: 1, photoCount: 0, videoCount: 1, engagedCount: 1,
    lastContentAt: "2026-10-30T09:00:00.000Z",
  });

  await connection.query(
    `UPDATE \`${names.photos}\` SET source_views_count = 0, source_likes_count = 0 WHERE id = 'photo-1'`,
  );
  const beforeLocalView = await summary("creator-1");
  await connection.query(
    `UPDATE \`${names.photos}\` SET local_views_count = local_views_count + 1 WHERE id = 'photo-1'`,
  );
  assert.deepEqual(await summary("creator-1"), beforeLocalView);

  await connection.query(`DELETE FROM \`${names.photos}\` WHERE id = 'photo-3'`);
  assert.deepEqual(await summary("creator-1"), {
    mediaCount: 1, photoCount: 0, videoCount: 1, engagedCount: 0,
    lastContentAt: "2026-10-30T08:00:00.000Z",
  });

  const [actualRows] = await connection.query(
    `SELECT creator_id, media_count, photo_count, video_count, engaged_count, last_content_at
     FROM \`${names.stats}\` ORDER BY creator_id`,
  );
  const [expectedRows] = await connection.query(
    `SELECT creator_id, COUNT(*) AS media_count,
            COALESCE(SUM(type = 'photo'), 0) AS photo_count,
            COALESCE(SUM(type = 'video'), 0) AS video_count,
            COALESCE(SUM(COALESCE(source_views_count, 0) > 0
              OR COALESCE(source_likes_count, 0) > 0), 0) AS engaged_count,
            MAX(created_at) AS last_content_at
     FROM \`${names.photos}\`
     WHERE removed_from_index_at IS NULL
     GROUP BY creator_id ORDER BY creator_id`,
  );
  assert.deepEqual(
    actualRows.map((row) => ({ creatorId: row.creator_id, ...numericSummary(row) })),
    expectedRows.map((row) => ({ creatorId: row.creator_id, ...numericSummary(row) })),
  );

  await connection.query(
    `UPDATE \`${names.creators}\` SET removed_from_index_at = '2026-10-30 12:00:00'
     WHERE id = 'creator-2'`,
  );
  const [publicRows] = await connection.query(
    `SELECT c.id FROM \`${names.creators}\` c
     JOIN \`${names.stats}\` stats ON stats.creator_id = c.id AND stats.media_count >= 1
     WHERE c.removed_from_index_at IS NULL ORDER BY c.id`,
  );
  assert.deepEqual(publicRows.map((row) => row.id), ["creator-1"]);

  await connection.query(
    `INSERT INTO \`${names.creators}\` (id)
     VALUES ('creator-3'), ('creator-4'), ('creator-5'), ('creator-6'), ('creator-7')`,
  );
  await connection.query(
    `INSERT INTO \`${names.photos}\`
       (id, creator_id, type, source_views_count, source_likes_count, created_at)
     VALUES
       ('photo-4', 'creator-3', 'photo', 0, 0, '2026-10-30 11:00:00'),
       ('photo-5', 'creator-3', 'photo', 0, 0, '2026-10-30 11:05:00'),
       ('photo-6', 'creator-4', 'photo', 0, 0, '2026-10-30 12:00:00'),
       ('photo-7', 'creator-4', 'video', 0, 0, '2026-10-30 12:05:00'),
       ('photo-8', 'creator-5', 'photo', 0, 0, '2026-10-30 13:00:00'),
       ('photo-9', 'creator-5', 'video', 0, 0, '2026-10-30 13:05:00'),
       ('photo-10', 'creator-7', 'photo', 0, 0, '2026-10-30 13:10:00')`,
  );

  // Defensive decrements must tolerate an already-drifted zero row without an
  // unsigned subtraction error; the second migration below reconciles it.
  await connection.query(
    `UPDATE \`${names.stats}\`
     SET media_count = 0, photo_count = 0, video_count = 0,
         engaged_count = 0, last_content_at = NULL
     WHERE creator_id = 'creator-7'`,
  );
  await connection.query(
    `UPDATE \`${names.photos}\`
     SET removed_from_index_at = '2026-10-30 13:11:00'
     WHERE id = 'photo-10'`,
  );
  assert.deepEqual(await summary("creator-7"), {
    mediaCount: 0, photoCount: 0, videoCount: 0, engagedCount: 0,
    lastContentAt: null,
  });

  // Two writers flip engagement on different media for one creator. The second
  // trigger must add its delta after the first commits, not write a stale total.
  await connection.beginTransaction();
  await concurrentConnection.beginTransaction();
  await connection.query(
    `UPDATE \`${names.photos}\` SET source_views_count = 1 WHERE id = 'photo-4'`,
  );
  const concurrentEngagement = concurrentConnection.query(
    `UPDATE \`${names.photos}\` SET source_likes_count = 1 WHERE id = 'photo-5'`,
  );
  await waitForBlockedUpdate(concurrentEngagement, "concurrent engagement update");
  await connection.commit();
  await concurrentEngagement;
  await concurrentConnection.commit();
  assert.deepEqual(await summary("creator-3"), {
    mediaCount: 2, photoCount: 2, videoCount: 0, engagedCount: 2,
    lastContentAt: "2026-10-30T11:05:00.000Z",
  });

  // Concurrent removals must decrement twice and repair the maximum timestamp.
  await connection.beginTransaction();
  await concurrentConnection.beginTransaction();
  await connection.query(
    `UPDATE \`${names.photos}\` SET removed_from_index_at = '2026-10-30 14:00:00'
     WHERE id = 'photo-6'`,
  );
  const concurrentRemoval = concurrentConnection.query(
    `UPDATE \`${names.photos}\` SET removed_from_index_at = '2026-10-30 14:00:01'
     WHERE id = 'photo-7'`,
  );
  await waitForBlockedUpdate(concurrentRemoval, "concurrent removal update");
  await connection.commit();
  await concurrentRemoval;
  await concurrentConnection.commit();
  assert.deepEqual(await summary("creator-4"), {
    mediaCount: 0, photoCount: 0, videoCount: 0, engagedCount: 0,
    lastContentAt: null,
  });

  // Moving one row while another row is deleted exercises both creator rows
  // without allowing an absolute aggregate to resurrect the source count.
  await connection.beginTransaction();
  await concurrentConnection.beginTransaction();
  await connection.query(
    `UPDATE \`${names.photos}\` SET creator_id = 'creator-6' WHERE id = 'photo-8'`,
  );
  const concurrentDelete = concurrentConnection.query(
    `DELETE FROM \`${names.photos}\` WHERE id = 'photo-9'`,
  );
  await waitForBlockedUpdate(concurrentDelete, "concurrent move/delete");
  await connection.commit();
  await concurrentDelete;
  await concurrentConnection.commit();
  assert.deepEqual(await summary("creator-5"), {
    mediaCount: 0, photoCount: 0, videoCount: 0, engagedCount: 0,
    lastContentAt: null,
  });
  assert.deepEqual(await summary("creator-6"), {
    mediaCount: 1, photoCount: 1, videoCount: 0, engagedCount: 0,
    lastContentAt: "2026-10-30T13:00:00.000Z",
  });

  // A second application is safe and reconciles to the same source of truth.
  for (const statement of migrationStatements) await connection.query(statement);
  const [finalActualRows] = await connection.query(
    `SELECT creator_id, media_count, photo_count, video_count, engaged_count, last_content_at
     FROM \`${names.stats}\` ORDER BY creator_id`,
  );
  const [finalExpectedRows] = await connection.query(
    `SELECT creator_id, COUNT(*) AS media_count,
            COALESCE(SUM(type = 'photo'), 0) AS photo_count,
            COALESCE(SUM(type = 'video'), 0) AS video_count,
            COALESCE(SUM(COALESCE(source_views_count, 0) > 0
              OR COALESCE(source_likes_count, 0) > 0), 0) AS engaged_count,
            MAX(created_at) AS last_content_at
     FROM \`${names.photos}\`
     WHERE removed_from_index_at IS NULL
     GROUP BY creator_id ORDER BY creator_id`,
  );
  const expectedByCreator = new Map(
    finalExpectedRows.map((row) => [row.creator_id, numericSummary(row)]),
  );
  for (const row of finalActualRows) {
    const actual = numericSummary(row);
    const expected = expectedByCreator.get(row.creator_id) ?? {
      mediaCount: 0, photoCount: 0, videoCount: 0, engagedCount: 0,
      lastContentAt: null,
    };
    assert.deepEqual(actual, expected, `second migration drifted ${row.creator_id}`);
    expectedByCreator.delete(row.creator_id);
  }
  assert.equal(expectedByCreator.size, 0, "second migration missed public creators");

  console.log(JSON.stringify({ ok: true, scenarios: 13 }));
} finally {
  await connection.rollback().catch(() => undefined);
  await concurrentConnection.rollback().catch(() => undefined);
  await cleanup();
  await concurrentConnection.end();
  await connection.end();
}
