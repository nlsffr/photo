// @ts-expect-error Node's native type stripping requires the explicit suffix.
import { creatorCollectionPath } from "./creator-collections.ts";
import type { CreatorCollection } from "./creator-collections.ts";

// Keep the existing conservative per-partition limit; one public URL is emitted per profile.
export const CREATOR_SITEMAP_PROFILE_LIMIT = 12_000;
export const CREATOR_SITEMAP_QUERY_LIMIT = 50_000;

export type CreatorSitemapProfile = {
  handle: string;
  urlVersion: number;
  updatedAt: string | null;
  lastContentAt: string | null;
};

export function assertCreatorSitemapCapacity(
  profiles: readonly CreatorSitemapProfile[],
): void {
  if (profiles.length > CREATOR_SITEMAP_PROFILE_LIMIT) {
    throw new Error("creator_sitemap_partition_required");
  }
}

type CreatorSitemapEntry = {
  url: string;
  lastmod?: string;
};

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function siteBase(site: string): string {
  const parsed = new URL(site);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("Invalid sitemap site URL");
  }
  return parsed.toString().replace(/\/$/, "");
}

function iso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function latestIso(...values: Array<string | null | undefined>): string | undefined {
  return values
    .map(iso)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

export function buildCreatorSitemapEntries(
  site: string,
  collection: CreatorCollection,
  profiles: readonly CreatorSitemapProfile[],
): CreatorSitemapEntry[] {
  const base = siteBase(site);
  const entries: CreatorSitemapEntry[] = [];
  let acceptedProfiles = 0;

  for (const profile of profiles) {
    let path: string;
    try {
      path = creatorCollectionPath(profile.handle, profile.urlVersion, collection);
    } catch {
      // A malformed database handle must not make the whole sitemap unavailable.
      continue;
    }
    acceptedProfiles++;
    if (acceptedProfiles > CREATOR_SITEMAP_PROFILE_LIMIT) {
      throw new Error("creator_sitemap_partition_required");
    }
    const lastmod = latestIso(profile.updatedAt, profile.lastContentAt);
    entries.push({ url: `${base}${path}`, lastmod });
  }
  return entries;
}

export function renderCreatorSitemap(
  site: string,
  collection: CreatorCollection,
  profiles: readonly CreatorSitemapProfile[],
): string {
  const urls = buildCreatorSitemapEntries(site, collection, profiles)
    .map((entry) => `  <url>\n    <loc>${xmlEscape(entry.url)}</loc>\n${entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : ""}    <changefreq>daily</changefreq>\n    <priority>${collection === "overview" ? "0.8" : "0.7"}</priority>\n  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
