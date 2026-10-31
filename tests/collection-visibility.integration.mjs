import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

// Dedicated, newly created schema only: never run fixtures against the application database.
const url = new URL(process.env.TEST_DATABASE_URL || "mysql://invalid");
const schema = url.pathname.slice(1);
assert.match(schema, /^photo_visibility_test_[a-z0-9_]+$/);
url.pathname = "/";
const db = await mysql.createConnection(url.toString());
let created = false;

async function migrate(name, { failAfterReset = false, afterLock } = {}) {
  let sql = await readFile(new URL("../migrations/" + name, import.meta.url), "utf8");
  if (failAfterReset) {
    const insert = "SET STATEMENT max_statement_time=15 FOR\nINSERT INTO creator_collection_stats";
    assert.ok(sql.includes(insert));
    sql = sql.replace(insert, "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture_failure';\n" + insert);
  }
  let delimiter = ";", buffer = "";
  for (const line of sql.split("\n")) {
    if (line.startsWith("DELIMITER ")) {
      assert.equal(buffer.trim(), "");
      delimiter = line.slice(10).trim();
      continue;
    }
    if (!buffer.trim() && (line.trim().startsWith("--") || !line.trim())) continue;
    buffer += line + "\n";
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length);
      await db.query(statement);
      if (statement.startsWith("LOCK TABLES") && afterLock) await afterLock();
      buffer = "";
    }
  }
  assert.equal(buffer.trim(), "");
}
async function expectStats(creator, counts, last = null) {
  const [rows] = await db.query(
    "SELECT media_count,photo_count,video_count,engaged_count,DATE_FORMAT(last_content_at,'%Y-%m-%d') AS last_day FROM creator_collection_stats WHERE creator_id=?",
    [creator],
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0].media_count, rows[0].photo_count, rows[0].video_count, rows[0].engaged_count].map(Number),
    counts,
  );
  assert.equal(rows[0].last_day, last);
}
async function photo(id, creator, type, hidden, removed, day, engaged = 1) {
  await db.query(
    "INSERT INTO photos(id,creator_id,type,is_hidden,removed_from_index_at,created_at,source_views_count) VALUES(?,?,?,?,?,?,?)",
    [id, creator, type, hidden, removed ? "2026-01-01" : null, day, engaged],
  );
}

try {
  await db.query("CREATE DATABASE " + schema + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  created = true;
  await db.changeUser({ database: schema });
  await db.query("SET time_zone='+00:00'");
  await db.query("CREATE TABLE creators(id CHAR(36) PRIMARY KEY) ENGINE=InnoDB");
  await db.query(`CREATE TABLE photos(
    id CHAR(36) PRIMARY KEY, creator_id CHAR(36) NOT NULL,
    type VARCHAR(16) NOT NULL, is_hidden TINYINT NOT NULL DEFAULT 0,
    removed_from_index_at TIMESTAMP NULL, created_at TIMESTAMP NULL,
    source_views_count BIGINT NULL, source_likes_count BIGINT NULL,
    local_views_count BIGINT NOT NULL DEFAULT 0,
    INDEX creator_created(creator_id,created_at)
  ) ENGINE=InnoDB`);
  await db.query("INSERT INTO creators VALUES('a'),('b')");
  await photo("visible-photo", "a", "photo", 0, false, "2026-01-01");
  await photo("visible-video", "a", "video", 0, false, "2026-01-02");
  await photo("hidden-photo", "a", "photo", 1, false, "2026-01-03");
  await photo("removed-video", "a", "video", 0, true, "2026-01-04");
  await migrate("019-creator-collection-stats.sql");
  if (process.env.VISIBILITY_BASELINE !== "1") await migrate("020-hidden-collection-stats.sql");
  await expectStats("a", [2,1,1,2], "2026-01-02");
  await db.query("UPDATE photos SET is_hidden=1 WHERE id='visible-video'");
  await expectStats("a", [1,1,0,1], "2026-01-01");
  await db.query("UPDATE photos SET is_hidden=1 WHERE id='visible-photo'");
  await expectStats("a", [0,0,0,0]);
  await db.query("UPDATE photos SET is_hidden=0 WHERE id='visible-photo'");
  await expectStats("a", [1,1,0,1], "2026-01-01");
  await db.query("UPDATE photos SET removed_from_index_at='2026-02-01' WHERE id='visible-photo'");
  await expectStats("a", [0,0,0,0]);
  await db.query("UPDATE photos SET removed_from_index_at=NULL,is_hidden=1 WHERE id='removed-video'");
  await expectStats("a", [0,0,0,0]);
  await db.query("UPDATE photos SET is_hidden=0 WHERE id='visible-video'");
  await expectStats("a", [1,0,1,1], "2026-01-02");
  await db.query("UPDATE photos SET creator_id='b' WHERE id='visible-video'");
  await expectStats("a", [0,0,0,0]);
  await expectStats("b", [1,0,1,1], "2026-01-02");
  await photo("new-hidden", "a", "photo", 1, false, "2026-01-05", 0);
  await expectStats("a", [0,0,0,0]);
  await db.query("UPDATE photos SET is_hidden=0 WHERE id='new-hidden'");
  await expectStats("a", [1,1,0,0], "2026-01-05");
  await db.query("UPDATE photos SET source_likes_count=1,type='video',created_at='2025-12-31' WHERE id='new-hidden'");
  await expectStats("a", [1,0,1,1], "2025-12-31");
  await db.query("UPDATE photos SET local_views_count=local_views_count+1 WHERE id='new-hidden'");
  await expectStats("a", [1,0,1,1], "2025-12-31");
  await db.beginTransaction();
  await db.query("UPDATE photos SET is_hidden=1 WHERE id='new-hidden'");
  await expectStats("a", [0,0,0,0]);
  await db.rollback();
  await expectStats("a", [1,0,1,1], "2025-12-31");
  await db.query("DELETE FROM photos WHERE id='hidden-photo'");
  await expectStats("a", [1,0,1,1], "2025-12-31");
  await db.query("DELETE FROM photos WHERE id='visible-video'");
  await expectStats("b", [0,0,0,0]);
  await migrate("020-hidden-collection-stats.sql");
  await expectStats("a", [1,0,1,1], "2025-12-31");
  await expectStats("b", [0,0,0,0]);
  await assert.rejects(
    () => migrate("020-hidden-collection-stats.sql", { failAfterReset: true }),
    (error) => error.code === "ER_SIGNAL_EXCEPTION",
  );
  await db.rollback();
  await db.query("UNLOCK TABLES");
  await db.query("SET autocommit=1");
  await expectStats("a", [1,0,1,1], "2025-12-31");
  await expectStats("b", [0,0,0,0]);
  const writer = await mysql.createConnection(process.env.TEST_DATABASE_URL);
  try {
    let pending;
    let writerFinished = false;
    await migrate("020-hidden-collection-stats.sql", { afterLock: async () => {
      pending = writer.query("INSERT INTO photos(id,creator_id,type,is_hidden,created_at) VALUES('blocked-writer','b','photo',0,'2026-01-06')")
        .then(() => { writerFinished = true; });
      await new Promise((resolve) => setTimeout(resolve, 75));
      assert.equal(writerFinished, false, "writer must wait until the backfill releases its read lock");
    } });
    await pending;
    await expectStats("b", [1,1,0,0], "2026-01-06");
    await Promise.all([
      db.query("INSERT INTO photos(id,creator_id,type,is_hidden,created_at) VALUES('concurrent-a','b','photo',0,'2026-01-07')"),
      writer.query("INSERT INTO photos(id,creator_id,type,is_hidden,created_at) VALUES('concurrent-b','b','photo',0,'2026-01-08')"),
    ]);
    await expectStats("b", [3,3,0,0], "2026-01-08");
  } finally { await writer.end(); }
  console.log(JSON.stringify({ ok: true, schema, coverage: "backfill, hidden insert/update/delete, removal, creator/type/date changes, engagement, local views, transaction rollback, failed-backfill rollback, writer blocking, concurrent inserts, rerun" }));
} finally {
  try {
    await db.rollback();
    await db.query("UNLOCK TABLES");
    if (created) await db.query("DROP DATABASE " + schema);
  } finally {
    await db.end();
  }
}
