import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SITE = "https://leakfanhub.com";

async function loadCreatorSitemap() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit suffix.
    return await import("../src/lib/creator-sitemap.ts");
  } catch (error) {
    assert.fail(`creator sitemap helpers are unavailable: ${String(error)}`);
  }
}

const eligible = {
  handle: "tina_kitsune",
  urlVersion: 3,
  updatedAt: "2026-10-30T08:00:00.000Z",
  lastContentAt: null,
};

test("creator sitemap lists each eligible versioned collection once without retired language alternatives", async () => {
  const { buildCreatorSitemapEntries, renderCreatorSitemap } = await loadCreatorSitemap();
  for (const collection of ["overview", "photos", "videos", "popular"] as const) {
    const path = `/tina_kitsune-v3${collection === "overview" ? "" : `/${collection}`}`;
    const entries = buildCreatorSitemapEntries(SITE, collection, [eligible]);
    assert.deepEqual(entries, [{ url: `${SITE}${path}`, lastmod: eligible.updatedAt }]);
    const xml = renderCreatorSitemap(SITE, collection, [eligible]);
    assert.equal((xml.match(/<url>/g) ?? []).length, 1);
    assert.ok(xml.includes(`<loc>${SITE}${path}</loc>`));
    assert.match(xml, /<lastmod>2026-10-30T08:00:00\.000Z<\/lastmod>/);
    assert.doesNotMatch(xml, /xhtml|hreflang|\/(?:en|fr|es|de|it|pt|nl|ru|zh|ja|hi|th)\//);
  }
});

test("creator sitemap keeps the newest valid lastmod and skips invalid handles", async () => {
  const { buildCreatorSitemapEntries } = await loadCreatorSitemap();
  const entries = buildCreatorSitemapEntries(`${SITE}/`, "videos", [
    { ...eligible, handle: "bad/handle" },
    { ...eligible, updatedAt: "not-a-date", lastContentAt: "2026-11-01T01:00:00Z" },
    { ...eligible, handle: "fixture_second", urlVersion: 1, lastContentAt: "2026-11-01T02:00:00Z" },
  ]);
  assert.deepEqual(entries, [
    { url: `${SITE}/tina_kitsune-v3/videos`, lastmod: "2026-11-01T01:00:00.000Z" },
    { url: `${SITE}/fixture_second/videos`, lastmod: "2026-11-01T02:00:00.000Z" },
  ]);
});

test("creator sitemap query enforces each public quality threshold", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit suffix.
  const { creatorSitemapProfilesSql } = await import("../src/lib/creator-sitemap-query.ts");
  const overview = creatorSitemapProfilesSql("overview").replace(/\s+/g, " ");
  const photos = creatorSitemapProfilesSql("photos").replace(/\s+/g, " ");
  const videos = creatorSitemapProfilesSql("videos").replace(/\s+/g, " ");
  const popular = creatorSitemapProfilesSql("popular").replace(/\s+/g, " ");

  for (const sql of [overview, photos, videos, popular]) {
    assert.match(sql, /creator_collection_stats stats/);
    assert.match(sql, /MOD\(CRC32\(c\.id\), 64\) = \?/);
    assert.doesNotMatch(sql, /FROM photos|GROUP BY|SUM\(|MAX\(|EXISTS/);
  }
  assert.match(overview, /stats\.media_count >= 1/);
  assert.match(photos, /stats\.photo_count >= 12/);
  assert.match(videos, /stats\.video_count >= 4/);
  assert.match(popular, /stats\.media_count >= 24/);
  assert.match(popular, /stats\.engaged_count >= 8/);
});

test("creator sitemap skips unsafe rows and remains below the protocol URL limit", async () => {
  const {
    CREATOR_SITEMAP_PROFILE_LIMIT,
    assertCreatorSitemapCapacity,
    renderCreatorSitemap,
  } = await loadCreatorSitemap();
  const rows = Array.from({ length: CREATOR_SITEMAP_PROFILE_LIMIT + 5 }, (_, index) => ({
    ...eligible,
    handle: `creator_${index}`.padEnd(100, "a"),
    urlVersion: 2_147_483_647,
  }));
  rows.unshift({ ...eligible, handle: "bad/handle" });
  assert.throws(
    () => assertCreatorSitemapCapacity(rows.slice(1)),
    /creator_sitemap_partition_required/,
  );
  const bounded = rows.slice(0, CREATOR_SITEMAP_PROFILE_LIMIT + 1);
  const xml = renderCreatorSitemap(SITE, "popular", bounded);

  assert.equal((xml.match(/<url>/g) ?? []).length, CREATOR_SITEMAP_PROFILE_LIMIT);
  assert.ok((xml.match(/<url>/g) ?? []).length < 50_000);
  assert.ok(Buffer.byteLength(xml, "utf8") < 50 * 1024 * 1024);
  assert.doesNotMatch(xml, /bad\/handle/);
});

test("creator sitemap queries are bounded, index-guided, and exclude removed content", async () => {
  const source = await readFile(
    new URL("../src/lib/creator-sitemap-query.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /SET STATEMENT max_statement_time=5 FOR/);
  assert.match(source, /activeCreatorSql\("c"\)/);
  assert.match(source, /ORDER BY c\.id/);
  assert.match(source, /LIMIT \?/);
  assert.doesNotMatch(source, /OFFSET|RAND\(\)/);
});

test("sitemap index advertises every creator collection sitemap", async () => {
  const source = await readFile(
    new URL("../src/app/sitemap.xml/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /creatorSitemapPartitionLocations\(SITE\)/);
  assert.doesNotMatch(source, /sitemaps\/profiles|sitemaps\/collections\//);
});
