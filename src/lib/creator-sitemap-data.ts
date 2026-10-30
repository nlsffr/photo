import "server-only";

import { createAsyncTtlCacheMap } from "./async-ttl-cache";
import {
  CREATOR_SITEMAP_PROFILE_LIMIT,
  assertCreatorSitemapCapacity,
  renderCreatorSitemap,
} from "./creator-sitemap";
import type { CreatorCollection } from "./creator-collections";
import { getCreatorSitemapProfiles } from "./sitemap-data";

const CACHE_TTL_MS = 5 * 60 * 1_000;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

const loadCreatorSitemapByCollection = createAsyncTtlCacheMap(
  async (collection: CreatorCollection) => {
    const profiles = await getCreatorSitemapProfiles(
      collection,
      CREATOR_SITEMAP_PROFILE_LIMIT + 1,
    );
    assertCreatorSitemapCapacity(profiles);
    return renderCreatorSitemap(SITE, collection, profiles);
  },
  CACHE_TTL_MS,
  Date.now,
  4,
);

export async function loadCreatorSitemap(collection: CreatorCollection): Promise<string> {
  return loadCreatorSitemapByCollection(collection);
}
