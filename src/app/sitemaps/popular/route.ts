import { createAsyncTtlCache } from "@/lib/async-ttl-cache";
import { getPopularSitemapMedia } from "@/lib/sitemap-data";
import { toMediaSitemapEntry } from "@/lib/sitemap-route";
import { renderMediaSitemap } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 300;
const CACHE_TTL_MS = 5 * 60 * 1_000;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);
const LIMIT = 2_000;

const loadPopularSitemap = createAsyncTtlCache(async () => {
  const items = await getPopularSitemapMedia(LIMIT);
  return renderMediaSitemap(
    items.map((photo) => toMediaSitemapEntry(photo, SITE)),
  );
}, CACHE_TTL_MS);

export async function GET() {
  let body: string;
  try {
    body = await loadPopularSitemap();
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
