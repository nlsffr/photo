// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { localePath, type Locale } from "./config.ts";

export const LOCALIZED_INDEXABLE_ENTRIES = [
  { path: "/", changeFrequency: "hourly", priority: 1 },
  { path: "/models", changeFrequency: "daily", priority: 0.9 },
  { path: "/trending-medias", changeFrequency: "hourly", priority: 0.8 },
  { path: "/most-liked", changeFrequency: "daily", priority: 0.8 },
  { path: "/classements", changeFrequency: "daily", priority: 0.6 },
  { path: "/influenceuses-tendances", changeFrequency: "daily", priority: 0.6 },
  { path: "/about", changeFrequency: "monthly", priority: 0.3 },
  { path: "/dmca", changeFrequency: "monthly", priority: 0.3 },
  { path: "/trust-and-safety", changeFrequency: "monthly", priority: 0.3 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.3 },
  { path: "/conditions", changeFrequency: "monthly", priority: 0.2 },
  { path: "/confidentialite", changeFrequency: "monthly", priority: 0.2 },
  { path: "/mentions-legales", changeFrequency: "monthly", priority: 0.2 },
  { path: "/qu-est-ce-que-lumengallery", changeFrequency: "monthly", priority: 0.3 },
] as const;

const INDEXED_LOCALES = ["en", "fr"] as const satisfies readonly Locale[];

function siteBase(site: string): string {
  return site.replace(/\/$/, "");
}

function absoluteUrl(site: string, pathname: string): string {
  const base = siteBase(site);
  return pathname === "/" ? `${base}/` : `${base}${pathname}`;
}

function absoluteAlternates(site: string, pathname: string) {
  return {
    en: absoluteUrl(site, localePath("en", pathname)),
    fr: absoluteUrl(site, localePath("fr", pathname)),
    "x-default": absoluteUrl(site, pathname),
  };
}

export function buildLocalizedSitemapEntries(site: string) {
  return LOCALIZED_INDEXABLE_ENTRIES.flatMap((entry) =>
    INDEXED_LOCALES.map((locale) => ({
      url: absoluteUrl(site, localePath(locale, entry.path)),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
      alternates: { languages: absoluteAlternates(site, entry.path) },
    })),
  );
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderLocalizedStaticSitemapXml(site: string): string {
  const urls = buildLocalizedSitemapEntries(site)
    .map((entry) => {
      const links = Object.entries(entry.alternates.languages)
        .map(
          ([language, href]) =>
            `    <xhtml:link rel="alternate" hreflang="${language}" href="${xmlEscape(href)}" />`,
        )
        .join("\n");
      return `  <url>\n    <loc>${xmlEscape(entry.url)}</loc>\n${links}\n    <changefreq>${entry.changeFrequency}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}
