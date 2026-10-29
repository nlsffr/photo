import { getSitemapMediaPartitions } from "@/lib/sitemap-data";
import { renderSitemapIndex } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

export async function GET() {
  try {
    const partitions = await getSitemapMediaPartitions();
    const locations = [
      `${SITE}/sitemaps/static`,
      `${SITE}/sitemaps/popular`,
      `${SITE}/sitemaps/profiles`,
      `${SITE}/sitemaps/tags`,
      ...partitions.map((partition) => `${SITE}${partition.path}`),
    ];
    return new Response(renderSitemapIndex(locations), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Sitemap temporarily unavailable\n", {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
}
