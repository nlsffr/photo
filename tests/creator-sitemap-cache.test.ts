import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

test("creator sitemap rendering coalesces by collection and retries rejected capacity loads", async () => {
  const calls = new Map<string, number>();
  const profile = {
    handle: "alice",
    urlVersion: 1,
    updatedAt: null,
    lastContentAt: "2026-10-30T08:00:00.000Z",
  };
  const getCreatorSitemapProfiles = async (collection: string) => {
    calls.set(collection, (calls.get(collection) ?? 0) + 1);
    await Promise.resolve();
    return collection === "popular"
      ? Array.from({ length: 24_001 }, () => profile)
      : [profile];
  };
  const sitemapData = loadAppModule<{
    loadCreatorSitemap: (collection: "overview" | "photos" | "videos" | "popular") => Promise<string>;
  }>("src/lib/creator-sitemap-data.ts", {
    "server-only": {},
    "./sitemap-data": { getCreatorSitemapProfiles },
  });

  const [first, second] = await Promise.all([
    sitemapData.loadCreatorSitemap("photos"),
    sitemapData.loadCreatorSitemap("photos"),
  ]);
  assert.equal(first, second);
  assert.equal(calls.get("photos"), 1);

  await sitemapData.loadCreatorSitemap("videos");
  assert.equal(calls.get("videos"), 1);

  await assert.rejects(sitemapData.loadCreatorSitemap("popular"), /creator_sitemap_partition_required/);
  await assert.rejects(sitemapData.loadCreatorSitemap("popular"), /creator_sitemap_partition_required/);
  assert.equal(calls.get("popular"), 2, "rejected loads must not poison the cache");
});
