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
  assert.match(sql, /HAVING SUM\(is_indexable\) > 0/);
  assert.doesNotMatch(
    sql.slice(sql.indexOf("FROM photos"), sql.indexOf("), chunked AS")),
    /WHERE .*removed_from_index_at/i,
  );
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
