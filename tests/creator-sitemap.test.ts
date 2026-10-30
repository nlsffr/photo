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

test("creator sitemap publishes reciprocal English and French collection URLs with x-default", async () => {
  const { renderCreatorSitemap } = await loadCreatorSitemap();
  const xml = renderCreatorSitemap(SITE, "photos", [eligible]);

  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  for (const location of [
    `${SITE}/en/tina_kitsune-v3/photos`,
    `${SITE}/fr/tina_kitsune-v3/photos`,
  ]) {
    assert.match(xml, new RegExp(`<loc>${location}</loc>`));
  }
  assert.doesNotMatch(xml, new RegExp(`<loc>${SITE}/tina_kitsune-v3/photos</loc>`));
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    assert.equal((block.match(/hreflang="en"/g) ?? []).length, 1);
    assert.equal((block.match(/hreflang="fr"/g) ?? []).length, 1);
    assert.equal((block.match(/hreflang="x-default"/g) ?? []).length, 1);
    assert.match(block, /href="https:\/\/leakfanhub\.com\/tina_kitsune-v3\/photos"/);
    assert.match(block, /<lastmod>2026-10-30T08:00:00\.000Z<\/lastmod>/);
  }
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
    urlVersion: 1,
  }));
  rows.unshift({ ...eligible, handle: "bad/handle" });
  assert.throws(
    () => assertCreatorSitemapCapacity(rows.slice(1)),
    /creator_sitemap_partition_required/,
  );
  const bounded = rows.slice(0, CREATOR_SITEMAP_PROFILE_LIMIT + 1);
  const xml = renderCreatorSitemap(SITE, "overview", bounded);

  assert.equal((xml.match(/<url>/g) ?? []).length, CREATOR_SITEMAP_PROFILE_LIMIT * 2);
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

  for (const collection of ["photos", "videos", "popular"]) {
    assert.match(source, new RegExp(`sitemaps/collections/${collection}`));
  }
});
