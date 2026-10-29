import { getPopularSitemapMedia } from "@/lib/sitemap-data";
import { toMediaSitemapEntry } from "@/lib/sitemap-route";
import { renderMediaSitemap } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);
const LIMIT = 2_000;

export async function GET() {
  try {
    const items = await getPopularSitemapMedia(LIMIT);
    const body = renderMediaSitemap(
      items.map((photo) => toMediaSitemapEntry(photo, SITE)),
    );

    return new Response(body, {
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
