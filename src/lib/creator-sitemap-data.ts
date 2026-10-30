import "server-only";

import { createAsyncTtlCacheMap } from "./async-ttl-cache";
import {
  CREATOR_SITEMAP_QUERY_LIMIT,
  assertCreatorSitemapCapacity,
  renderCreatorSitemap,
} from "./creator-sitemap";
import { isRoutableCreatorHandle, type CreatorCollection } from "./creator-collections";
import { creatorSitemapPartitionPath } from "./creator-sitemap-partitions";
import { CREATOR_SITEMAP_BUCKETS } from "./seo-policy";
import { getCreatorSitemapProfiles } from "./sitemap-data";

const CACHE_TTL_MS = 5 * 60 * 1_000;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

const loadCreatorSitemapByCollection = createAsyncTtlCacheMap(
  async (key: string) => {
    const [collection, rawBucket] = key.split(":");
    const bucket = Number(rawBucket);
    creatorSitemapPartitionPath(collection as CreatorCollection, bucket);
    const candidates = await getCreatorSitemapProfiles(
      collection as CreatorCollection,
      bucket,
      CREATOR_SITEMAP_QUERY_LIMIT + 1,
    );
    if (candidates.length > CREATOR_SITEMAP_QUERY_LIMIT) {
      throw new Error("creator_sitemap_query_limit_exceeded");
    }
    const profiles = candidates.filter((profile) => isRoutableCreatorHandle(profile.handle));
    assertCreatorSitemapCapacity(profiles);
    return renderCreatorSitemap(SITE, collection as CreatorCollection, profiles);
  },
  CACHE_TTL_MS,
  Date.now,
  CREATOR_SITEMAP_BUCKETS * 4,
);

export async function loadCreatorSitemap(
  collection: CreatorCollection,
  bucket: number,
): Promise<string> {
  creatorSitemapPartitionPath(collection, bucket);
  return loadCreatorSitemapByCollection(`${collection}:${bucket}`);
}
