import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function latestMigration() {
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith("collection-stats.sql")).sort();
  return readFile(new URL(files.at(-1)!, directory), "utf8");
}

test("collection counters exclude hidden media on every contribution and maximum lookup", async () => {
  const sql = await latestMigration();
  const insert = sql.match(/TRIGGER trg_photos_collection_stats_ai[\s\S]*?END\$\$/)?.[0] ?? "";
  const update = sql.match(/TRIGGER trg_photos_collection_stats_au[\s\S]*?END\$\$/)?.[0] ?? "";
  const deletion = sql.match(/TRIGGER trg_photos_collection_stats_ad[\s\S]*?END\$\$/)?.[0] ?? "";
  assert.match(insert, /IF NEW\.removed_from_index_at IS NULL AND NEW\.is_hidden = 0 THEN/);
  assert.match(update, /OLD\.is_hidden <=> NEW\.is_hidden/);
  assert.match(update, /IF OLD\.removed_from_index_at IS NULL AND OLD\.is_hidden = 0 THEN/);
  assert.match(update, /IF NEW\.removed_from_index_at IS NULL AND NEW\.is_hidden = 0 THEN/);
  assert.match(update, /NOT \(NEW\.is_hidden <=> 0\)/);
  assert.match(deletion, /IF OLD\.removed_from_index_at IS NULL AND OLD\.is_hidden = 0 THEN/);
  const maxima = [...sql.matchAll(/SELECT MAX\(p\.created_at\)[\s\S]*?\)\s*WHERE/g)];
  assert.equal(maxima.length, 2);
  for (const maximum of maxima) assert.match(maximum[0], /AND p\.is_hidden = 0/);
  assert.match(sql, /FROM photos p\s+WHERE p\.removed_from_index_at IS NULL AND p\.is_hidden = 0\s+GROUP BY/);
});

test("visibility repair replaces triggers atomically and bounds an all-or-nothing backfill", async () => {
  const sql = await latestMigration();
  assert.equal((sql.match(/CREATE OR REPLACE TRIGGER/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /DROP TRIGGER/);
  assert.match(sql, /SET SESSION lock_wait_timeout = 5/);
  assert.match(sql, /SET SESSION innodb_lock_wait_timeout = 5/);
  assert.equal((sql.match(/SET STATEMENT max_statement_time=15 FOR/g) ?? []).length, 2);
  assert.ok(sql.indexOf("SET autocommit = 0") < sql.indexOf("LOCK TABLES"));
  assert.ok(sql.indexOf("COMMIT;") > sql.indexOf("INSERT INTO creator_collection_stats", sql.indexOf("LOCK TABLES")));
  assert.ok(sql.indexOf("COMMIT;") < sql.indexOf("UNLOCK TABLES"));
  assert.match(sql, /UNLOCK TABLES;\s+SET autocommit = 1;/);
});
