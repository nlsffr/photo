import type { CreatorCollection } from "./creator-collections";
// @ts-expect-error Node's native type stripping requires the explicit suffix.
import { CREATOR_SITEMAP_BUCKETS } from "./seo-policy.ts";

export const CREATOR_SITEMAP_COLLECTIONS = [
  "overview",
  "photos",
  "videos",
  "popular",
] as const satisfies readonly CreatorCollection[];

const COLLECTIONS = new Set<string>(CREATOR_SITEMAP_COLLECTIONS);

export function isCreatorSitemapCollection(value: string): value is CreatorCollection {
  return COLLECTIONS.has(value);
}

export function parseCreatorSitemapBucket(raw: string): number | null {
  if (!/^\d{2}$/.test(raw)) return null;
  const bucket = Number(raw);
  return bucket >= 0 && bucket < CREATOR_SITEMAP_BUCKETS ? bucket : null;
}

export function creatorSitemapPartitionPath(
  collection: CreatorCollection,
  bucket: number,
): string {
  if (!isCreatorSitemapCollection(collection)) {
    throw new TypeError("Invalid creator sitemap collection");
  }
  if (!Number.isInteger(bucket) || bucket < 0 || bucket >= CREATOR_SITEMAP_BUCKETS) {
    throw new TypeError("Invalid creator sitemap bucket");
  }
  return `/sitemaps/creators/${collection}/${String(bucket).padStart(2, "0")}`;
}

export function creatorSitemapPartitionLocations(
  site: string,
  collection?: CreatorCollection,
): string[] {
  const base = new URL(site).toString().replace(/\/$/, "");
  const collections = collection ? [collection] : CREATOR_SITEMAP_COLLECTIONS;
  return collections.flatMap((family) =>
    Array.from(
      { length: CREATOR_SITEMAP_BUCKETS },
      (_, bucket) => `${base}${creatorSitemapPartitionPath(family, bucket)}`,
    ),
  );
}
