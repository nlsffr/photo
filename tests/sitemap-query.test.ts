import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadQueries() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit suffix.
    return await import("../src/lib/sitemap-query.ts");
  } catch (error) {
    assert.fail(`sitemap query contracts are unavailable: ${String(error)}`);
  }
}

test("partition boundaries rank every physical row before filtering removals", async () => {
  const { SITEMAP_PARTITION_BOUNDARIES_SQL } = await loadQueries();
  const sql = SITEMAP_PARTITION_BOUNDARIES_SQL.replace(/\s+/g, " ");

  assert.match(sql, /ROW_NUMBER\(\) OVER/);
  assert.match(sql, /AS partition_row_num/);
  assert.doesNotMatch(sql, /\bAS row_number\b/i);
  assert.match(sql, /CASE WHEN p\.removed_from_index_at IS NULL AND c\.removed_from_index_at IS NULL AND c\.is_hidden = 0 AND p\.is_hidden = 0 THEN 1 ELSE 0 END AS is_indexable/);
  assert.match(sql, /MAX\(is_indexable\) AS has_indexable/);
  assert.match(sql, /WHERE has_indexable > 0/);
  assert.doesNotMatch(
    sql.slice(sql.indexOf("FROM photos"), sql.indexOf("), chunked AS")),
    /WHERE .*removed_from_index_at/i,
  );
});

test("sitemap index reconstruction is bounded and does not join two copies of the ranked catalogue", async () => {
  const { SITEMAP_PARTITION_BOUNDARIES_SQL } = await loadQueries();
  const sql = SITEMAP_PARTITION_BOUNDARIES_SQL.replace(/\s+/g, " ");

  assert.match(sql, /^SET STATEMENT max_statement_time=20 FOR WITH ranked AS/);
  assert.equal((sql.match(/\bFROM ranked\b/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /\bJOIN active_partitions\b/);
  assert.equal((sql.match(/\?/g) ?? []).length, 3);
});

test("next physical boundaries are retained before excluding entirely hidden partitions", async () => {
  const { SITEMAP_PARTITION_BOUNDARIES_SQL } = await loadQueries();
  const sql = SITEMAP_PARTITION_BOUNDARIES_SQL.replace(/\s+/g, " ");

  assert.match(sql, /MIN\(created_at\) AS created_at/);
  assert.match(sql, /MAX\(CASE WHEN MOD\(partition_row_num - 1, \?\) = 0 THEN id END\) AS id/);
  assert.match(sql, /LEAD\(created_at\) OVER \( PARTITION BY bucket_date ORDER BY partition_number \) AS next_created_at/);
  assert.match(sql, /LEAD\(id\) OVER \( PARTITION BY bucket_date ORDER BY partition_number \) AS next_id/);
  assert.match(sql, /FROM bounded WHERE has_indexable > 0/);
});

test("partition reads use a physical-row upper boundary and an exclusive keyset", async () => {
  const {
    SITEMAP_NEXT_BOUNDARY_SQL,
    sitemapPartitionMediaSql,
  } = await loadQueries();
  const nextBoundary = SITEMAP_NEXT_BOUNDARY_SQL.replace(/\s+/g, " ");
  const boundedRead = sitemapPartitionMediaSql(true).replace(/\s+/g, " ");

  assert.doesNotMatch(nextBoundary, /removed_from_index_at/);
  assert.match(nextBoundary, /ORDER BY p\.created_at ASC, p\.id ASC/);
  assert.match(boundedRead, /p\.created_at < \? OR \(p\.created_at = \? AND p\.id < \?\)/);
});

test("popular sitemap follows the existing views index without a filesort", async () => {
  const source = await readFile(
    new URL("../src/lib/sitemap-data.ts", import.meta.url),
    "utf8",
  );
  const popular = source.slice(source.indexOf("getPopularSitemapMedia"));

  assert.match(popular, /FROM photos p FORCE INDEX \(idx_photos_views_id\)/);
  assert.match(popular, /ORDER BY p\.views_count DESC, p\.id ASC/);
  assert.doesNotMatch(popular, /p\.likes_count DESC/);
});
