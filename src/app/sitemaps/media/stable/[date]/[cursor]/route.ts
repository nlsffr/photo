import { getSitemapMediaPartition } from "@/lib/sitemap-data";
import { decodeSitemapCursor } from "@/lib/sitemap-partitions";
import { isSitemapPartitionDate } from "@/lib/seo-policy";
import { toMediaSitemapEntry } from "@/lib/sitemap-route";
import { renderMediaSitemap } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

export async function GET(
  _request: Request,
  context: { params: Promise<{ date: string; cursor: string }> },
) {
  const { date, cursor } = await context.params;
  const decoded = decodeSitemapCursor(cursor);
  if (
    !isSitemapPartitionDate(date) ||
    !decoded ||
    decoded.createdAt.slice(0, 10) !== date
  ) {
    return new Response("Not found\n", { status: 404 });
  }
  try {
    const items = await getSitemapMediaPartition(date, cursor);
    if (items.length === 0) return new Response("Not found\n", { status: 404 });
    return new Response(
      renderMediaSitemap(
        items.map((photo) => toMediaSitemapEntry(photo, SITE)),
      ),
      {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      },
    );
  } catch {
    return new Response("Sitemap temporarily unavailable\n", {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
}
