// @ts-expect-error Node's native type stripping requires the explicit suffix.
import { creatorCollectionPath } from "./creator-collections.ts";
import type { CreatorCollection } from "./creator-collections.ts";
// @ts-expect-error Node's native type stripping requires the explicit suffix.
import { LOCALES, type Locale } from "./i18n/config.ts";

// Two URL entries with eight alternate links fit below 50 MiB even at max handle/version length.
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

type CreatorSitemapAlternates = Record<Locale | "x-default", string>;

type CreatorSitemapEntry = {
  url: string;
  lastmod?: string;
  alternates: CreatorSitemapAlternates;
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
    let paths: CreatorSitemapAlternates;
    try {
      paths = Object.fromEntries([
        ...LOCALES.map((locale) => [locale, creatorCollectionPath(profile.handle, profile.urlVersion, collection, locale)]),
        ["x-default", creatorCollectionPath(profile.handle, profile.urlVersion, collection)],
      ]) as CreatorSitemapAlternates;
    } catch {
      // A malformed database handle must not make the whole sitemap unavailable.
      continue;
    }
    acceptedProfiles++;
    if (acceptedProfiles > CREATOR_SITEMAP_PROFILE_LIMIT) {
      throw new Error("creator_sitemap_partition_required");
    }
    const alternates = Object.fromEntries(
      Object.entries(paths).map(([language, path]) => [language, `${base}${path}`]),
    ) as CreatorSitemapAlternates;
    const lastmod = latestIso(profile.updatedAt, profile.lastContentAt);
    for (const language of ["en", "fr"] as const) {
      entries.push({ url: alternates[language], lastmod, alternates });
    }
  }
  return entries;
}

export function renderCreatorSitemap(
  site: string,
  collection: CreatorCollection,
  profiles: readonly CreatorSitemapProfile[],
): string {
  const urls = buildCreatorSitemapEntries(site, collection, profiles)
    .map((entry) => {
      const alternates = Object.entries(entry.alternates)
        .map(
          ([language, href]) =>
            `    <xhtml:link rel="alternate" hreflang="${language}" href="${xmlEscape(href)}" />`,
        )
        .join("\n");
      return `  <url>\n    <loc>${xmlEscape(entry.url)}</loc>\n${alternates}\n${entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : ""}    <changefreq>daily</changefreq>\n    <priority>${collection === "overview" ? "0.8" : "0.7"}</priority>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}
