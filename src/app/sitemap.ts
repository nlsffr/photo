import type { MetadataRoute } from "next";
import { getPhotos, getAllTags, getModels } from "@/lib/photos";
import { mediaHref } from "@/lib/types";

/** Runtime only — DB must be available (not baked empty at docker build). */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

const MAX_MEDIA = 40_000;
const PAGE = 500;

/**
 * Single sitemap at /sitemap.xml (Google-compatible).
 * For larger catalogs use /sitemaps (index) + /sitemaps/media/N
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/models`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/trending-medias`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/most-liked`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/feed`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}/tiktok`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}/pour-toi`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}/random/medias`, lastModified: now, changeFrequency: "hourly", priority: 0.6 },
    { url: `${SITE}/recherche`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE}/classements`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/influenceuses-tendances`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/dmca`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/trust-and-safety`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/conditions`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${SITE}/confidentialite`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${SITE}/mentions-legales`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
  ];

  try {
    const [models, tags] = await Promise.all([
      getModels("followers"),
      getAllTags(),
    ]);

    for (const m of models) {
      entries.push({
        url: `${SITE}/creator/${encodeURIComponent(m.handle)}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }

    for (const t of tags.slice(0, 2000)) {
      entries.push({
        url: `${SITE}/tag/${encodeURIComponent(t)}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.5,
      });
    }

    let count = 0;
    let cursor: number | undefined;
    const seen = new Set<string>();

    while (count < MAX_MEDIA) {
      const page = await getPhotos({
        sort: "recent",
        limit: PAGE,
        cursor,
      });
      if (!page.items.length) break;

      for (const p of page.items) {
        const href = mediaHref(p);
        if (seen.has(href)) continue;
        seen.add(href);
        entries.push({
          url: `${SITE}${href}`,
          lastModified: now,
          changeFrequency: "weekly",
          priority: 0.6,
        });
        count++;
        if (count >= MAX_MEDIA) break;
      }

      if (page.nextCursor == null) break;
      cursor = page.nextCursor;
    }
  } catch {
    // static entries only if DB fails
  }

  return entries;
}
