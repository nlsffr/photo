import { countIndexableMedia } from "@/lib/sitemap-data";
import { mediaSitemapFileCount } from "@/lib/seo-policy";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

/**
 * Sitemap index — order matters for bots:
 * 1) static hub pages
 * 2) top/popular media (high value)
 * 3) all creator profiles
 * 4) tags
 * 5) full media catalog in chunks (leakgallery-style volume)
 */
export async function GET() {
  try {
    const total = await countIndexableMedia();
    const mediaFiles = mediaSitemapFileCount(total);
    const locs = [
      `${SITE}/sitemaps/static`,
      `${SITE}/sitemaps/popular`,
      `${SITE}/sitemaps/profiles`,
      `${SITE}/sitemaps/tags`,
      ...Array.from(
        { length: mediaFiles },
        (_, i) => `${SITE}/sitemaps/media/${i}`,
      ),
    ];

    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      locs
        .map(
          (loc) =>
            `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n  </sitemap>`,
        )
        .join("\n") +
      `\n</sitemapindex>\n`;

    return new Response(body, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Sitemap temporarily unavailable\n", {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
