import type { MetadataRoute } from "next";
import { getPhotos, getAllTags, getModels } from "@/lib/photos";
import { mediaHref } from "@/lib/types";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://77.73.70.23";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/feed`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/models`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/recherche`, changeFrequency: "weekly", priority: 0.5 },
  ];

  try {
    const [photos, tags, models] = await Promise.all([
      getPhotos({ sort: "popular", limit: 200 }),
      getAllTags(),
      getModels("followers"),
    ]);

    for (const p of photos.items) {
      entries.push({
        url: `${SITE}${mediaHref(p)}`,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }

    for (const t of tags.slice(0, 80)) {
      entries.push({
        url: `${SITE}/tag/${encodeURIComponent(t)}`,
        changeFrequency: "daily",
        priority: 0.5,
      });
    }

    for (const m of models.slice(0, 100)) {
      entries.push({
        url: `${SITE}/creator/${encodeURIComponent(m.handle)}`,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  } catch {
    // build without DB
  }

  return entries;
}
