import type { MetadataRoute } from "next";

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
  const now = new Date();
  const paths: { path: string; changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"]; priority: number }[] = [
    { path: "/", changeFrequency: "hourly", priority: 1 },
    { path: "/models", changeFrequency: "daily", priority: 0.9 },
    { path: "/trending-medias", changeFrequency: "hourly", priority: 0.8 },
    { path: "/most-liked", changeFrequency: "daily", priority: 0.8 },
    { path: "/feed", changeFrequency: "hourly", priority: 0.7 },
    { path: "/classements", changeFrequency: "daily", priority: 0.6 },
    { path: "/about", changeFrequency: "monthly", priority: 0.3 },
    { path: "/dmca", changeFrequency: "monthly", priority: 0.3 },
    { path: "/trust-and-safety", changeFrequency: "monthly", priority: 0.3 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.3 },
    { path: "/conditions", changeFrequency: "monthly", priority: 0.2 },
    { path: "/confidentialite", changeFrequency: "monthly", priority: 0.2 },
  ];

  return paths.map((p) => ({
    url: `${SITE}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
