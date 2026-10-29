import type { MetadataRoute } from "next";
import { STATIC_SITEMAP_ENTRIES } from "@/lib/seo-policy";

/**
 * Lightweight /sitemap.xml — static pages only.
 * Full catalog lives in /sitemaps (index) + /sitemaps/media/N
 * to avoid 504 when Googlebot hits a 20k+ URL single file.
 */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

export default function sitemap(): MetadataRoute.Sitemap {
  return STATIC_SITEMAP_ENTRIES.map((p) => ({
    url: `${SITE}${p.path}`,
    changeFrequency:
      p.changeFrequency as MetadataRoute.Sitemap[0]["changeFrequency"],
    priority: p.priority,
  }));
}
