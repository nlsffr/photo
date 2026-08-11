import type { MetadataRoute } from "next";
import { getPhotos, getAllTags, getModels } from "@/lib/photos";
import { mediaHref } from "@/lib/types";

/** Always runtime — never bake an empty sitemap at docker build time. */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

/** Google limit 50k URLs / file — stay under. */
const MEDIA_CHUNK = 10_000;
const MEDIA_PAGE = 500;
const MAX_MEDIA_SITEMAPS = 50;

/**
 * 0 = static | 1 = profiles | 2 = tags | 3+ = media chunks
 * (same split idea as leakgallery.com)
 */
export async function generateSitemaps() {
  const ids: { id: number }[] = [{ id: 0 }, { id: 1 }, { id: 2 }];

  let total = 0;
  try {
    const page = await getPhotos({ sort: "recent", limit: 1, cursor: 0 });
    total = Number(page.total) || 0;
  } catch {
    total = 0;
  }

  const mediaFiles = Math.min(
    MAX_MEDIA_SITEMAPS,
    Math.max(1, Math.ceil(Math.max(total, 1) / MEDIA_CHUNK)),
  );
  for (let i = 0; i < mediaFiles; i++) {
    ids.push({ id: 3 + i });
  }
  return ids;
}

/** Next 15+ may pass props as a Promise — always resolve id. */
export default async function sitemap(
  props: { id: number | string } | Promise<{ id: number | string }>,
): Promise<MetadataRoute.Sitemap> {
  const { id } = await Promise.resolve(props);
  const sid = typeof id === "string" ? parseInt(id, 10) : Number(id);
  const now = new Date();

  if (!Number.isFinite(sid) || sid === 0) return staticSitemap(now);
  if (sid === 1) return profilesSitemap(now);
  if (sid === 2) return tagsSitemap(now);
  if (sid >= 3) return mediaSitemap(sid - 3, now);
  return staticSitemap(now);
}

function staticSitemap(now: Date): MetadataRoute.Sitemap {
  const paths: {
    path: string;
    changeFrequency: NonNullable<MetadataRoute.Sitemap[0]["changeFrequency"]>;
    priority: number;
  }[] = [
    { path: "/", changeFrequency: "hourly", priority: 1 },
    { path: "/models", changeFrequency: "daily", priority: 0.9 },
    { path: "/trending-medias", changeFrequency: "hourly", priority: 0.8 },
    { path: "/most-liked", changeFrequency: "daily", priority: 0.8 },
    { path: "/feed", changeFrequency: "hourly", priority: 0.7 },
    { path: "/tiktok", changeFrequency: "hourly", priority: 0.7 },
    { path: "/pour-toi", changeFrequency: "hourly", priority: 0.7 },
    { path: "/random", changeFrequency: "hourly", priority: 0.6 },
    { path: "/recherche", changeFrequency: "weekly", priority: 0.5 },
    { path: "/classements", changeFrequency: "daily", priority: 0.6 },
    { path: "/influenceuses-tendances", changeFrequency: "daily", priority: 0.6 },
    { path: "/about", changeFrequency: "monthly", priority: 0.3 },
    { path: "/dmca", changeFrequency: "monthly", priority: 0.3 },
    { path: "/trust-and-safety", changeFrequency: "monthly", priority: 0.3 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.3 },
    { path: "/conditions", changeFrequency: "monthly", priority: 0.2 },
    { path: "/confidentialite", changeFrequency: "monthly", priority: 0.2 },
    { path: "/mentions-legales", changeFrequency: "monthly", priority: 0.2 },
  ];
  return paths.map((p) => ({
    url: `${SITE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}

async function profilesSitemap(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const models = await getModels("followers");
    return models.map((m) => ({
      url: `${SITE}/creator/${encodeURIComponent(m.handle)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));
  } catch {
    return [];
  }
}

async function tagsSitemap(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const tags = await getAllTags();
    return tags.slice(0, 5_000).map((t) => ({
      url: `${SITE}/tag/${encodeURIComponent(t)}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.5,
    }));
  } catch {
    return [];
  }
}

async function mediaSitemap(
  chunkIndex: number,
  now: Date,
): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const offsetStart = chunkIndex * MEDIA_CHUNK;
  const offsetEnd = offsetStart + MEDIA_CHUNK;
  let cursor = offsetStart;
  const seen = new Set<string>();

  try {
    while (cursor < offsetEnd) {
      const limit = Math.min(MEDIA_PAGE, offsetEnd - cursor);
      const page = await getPhotos({
        sort: "recent",
        limit,
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
      }

      if (page.nextCursor == null) break;
      cursor = page.nextCursor;
    }
  } catch {
    // empty if DB down
  }

  return entries;
}
