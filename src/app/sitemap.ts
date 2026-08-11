import type { MetadataRoute } from "next";
import { getPhotos, getAllTags, getModels } from "@/lib/photos";
import { mediaHref } from "@/lib/types";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

/** Google max ~50k URLs per sitemap. We paginate photos to stay under that. */
const MAX_PHOTO_URLS = 40_000;
const PAGE_SIZE = 500;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/models`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/trending-medias`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE}/most-liked`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/feed`, lastModified: now, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE}/recherche`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE}/dmca`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];

  try {
    const [tags, models] = await Promise.all([
      getAllTags(),
      getModels("followers"),
    ]);

    for (const m of models) {
      entries.push({
        url: `${SITE}/creator/${encodeURIComponent(m.handle)}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }

    for (const t of tags.slice(0, 500)) {
      entries.push({
        url: `${SITE}/tag/${encodeURIComponent(t)}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.5,
      });
    }

    // Photos: walk popular then recent until cap
    let photoCount = 0;
    const seen = new Set<string>();

    for (const sort of ["popular", "recent"] as const) {
      let cursor: number | undefined;
      while (photoCount < MAX_PHOTO_URLS) {
        const page = await getPhotos({
          sort,
          limit: PAGE_SIZE,
          cursor,
        });
        if (!page.items.length) break;

        for (const p of page.items) {
          const href = mediaHref(p);
          if (seen.has(href)) continue;
          seen.add(href);
          entries.push({
            url: `${SITE}${href}`,
            changeFrequency: "weekly",
            priority: 0.6,
          });
          photoCount++;
          if (photoCount >= MAX_PHOTO_URLS) break;
        }

        if (page.nextCursor == null) break;
        cursor = page.nextCursor;
      }
    }
  } catch {
    // build without DB
  }

  return entries;
}
