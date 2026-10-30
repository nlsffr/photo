import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native type stripping requires the explicit suffix.
import { CREATOR_SITEMAP_COLLECTIONS, creatorSitemapPartitionLocations, creatorSitemapPartitionPath, parseCreatorSitemapBucket } from "../src/lib/creator-sitemap-partitions.ts";
// @ts-expect-error Node's native type stripping requires the explicit suffix.
import { CREATOR_SITEMAP_BUCKETS } from "../src/lib/seo-policy.ts";

test("creator sitemap partitions are stable, complete, and unique", () => {
  const locations = creatorSitemapPartitionLocations("https://leakfanhub.com");

  assert.equal(CREATOR_SITEMAP_BUCKETS, 64);
  assert.equal(CREATOR_SITEMAP_COLLECTIONS.length, 4);
  assert.equal(locations.length, 4 * CREATOR_SITEMAP_BUCKETS);
  assert.equal(new Set(locations).size, locations.length);
  assert.equal(locations[0], "https://leakfanhub.com/sitemaps/creators/overview/00");
  assert.equal(locations.at(-1), "https://leakfanhub.com/sitemaps/creators/popular/63");
});

test("creator sitemap partition paths validate collection and exact bucket spelling", () => {
  assert.equal(creatorSitemapPartitionPath("photos", 7), "/sitemaps/creators/photos/07");
  assert.equal(parseCreatorSitemapBucket("00"), 0);
  assert.equal(parseCreatorSitemapBucket("63"), 63);
  for (const raw of ["0", "7", "64", "99", "-1", "07x"]) {
    assert.equal(parseCreatorSitemapBucket(raw), null, raw);
  }
  assert.throws(() => creatorSitemapPartitionPath("unknown" as never, 0), /Invalid creator sitemap collection/);
  assert.throws(() => creatorSitemapPartitionPath("overview", 64), /Invalid creator sitemap bucket/);
});

test("one collection exposes exactly its 64 immutable bucket locations", () => {
  const locations = creatorSitemapPartitionLocations("https://leakfanhub.com/", "videos");
  assert.equal(locations.length, 64);
  assert.equal(locations[0], "https://leakfanhub.com/sitemaps/creators/videos/00");
  assert.equal(locations[63], "https://leakfanhub.com/sitemaps/creators/videos/63");
});
