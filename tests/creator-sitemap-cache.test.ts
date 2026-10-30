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
  const getCreatorSitemapProfiles = async (collection: string, bucket: number) => {
    const key = `${collection}:${bucket}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
    await Promise.resolve();
    if (collection === "popular") return Array.from({ length: 24_001 }, () => profile);
    if (collection === "overview" && bucket === 9) {
      return Array.from({ length: 50_001 }, () => ({ ...profile, handle: "contact" }));
    }
    if (collection === "overview") {
      return [profile, ...Array.from({ length: 24_001 }, () => ({ ...profile, handle: "contact" }))];
    }
    return [profile];
  };
  const sitemapData = loadAppModule<{
    loadCreatorSitemap: (collection: "overview" | "photos" | "videos" | "popular", bucket: number) => Promise<string>;
  }>("src/lib/creator-sitemap-data.ts", {
    "server-only": {},
    "./sitemap-data": { getCreatorSitemapProfiles },
  });

  const [first, second] = await Promise.all([
    sitemapData.loadCreatorSitemap("photos", 7),
    sitemapData.loadCreatorSitemap("photos", 7),
  ]);
  assert.equal(first, second);
  assert.equal(calls.get("photos:7"), 1);

  await sitemapData.loadCreatorSitemap("photos", 8);
  assert.equal(calls.get("photos:8"), 1);

  const filtered = await sitemapData.loadCreatorSitemap("overview", 1);
  assert.equal((filtered.match(/<url>/g) ?? []).length, 2);
  assert.doesNotMatch(filtered, /\/contact/);
  await assert.rejects(
    sitemapData.loadCreatorSitemap("overview", 9),
    /creator_sitemap_query_limit_exceeded/,
  );

  await assert.rejects(sitemapData.loadCreatorSitemap("popular", 3), /creator_sitemap_partition_required/);
  await assert.rejects(sitemapData.loadCreatorSitemap("popular", 3), /creator_sitemap_partition_required/);
  assert.equal(calls.get("popular:3"), 2, "rejected loads must not poison the cache");
});
