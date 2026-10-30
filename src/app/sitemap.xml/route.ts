import { createAsyncTtlCache } from "@/lib/async-ttl-cache";
import { getSitemapMediaPartitions } from "@/lib/sitemap-data";
import { renderSitemapIndex } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 300;
const CACHE_TTL_MS = 5 * 60 * 1_000;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

const loadSitemapIndex = createAsyncTtlCache(async () => {
  const partitions = await getSitemapMediaPartitions();
  const locations = [
    `${SITE}/sitemaps/static`,
    `${SITE}/sitemaps/popular`,
    `${SITE}/sitemaps/profiles`,
    `${SITE}/sitemaps/collections/photos`,
    `${SITE}/sitemaps/collections/videos`,
    `${SITE}/sitemaps/collections/popular`,
    `${SITE}/sitemaps/tags`,
    ...partitions.map((partition) => `${SITE}${partition.path}`),
  ];
  return renderSitemapIndex(locations);
}, CACHE_TTL_MS);

export async function GET() {
  let body: string;
  try {
    body = await loadSitemapIndex();
  } catch {
    return new Response("Sitemap temporarily unavailable\n", {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    },
  });
}
