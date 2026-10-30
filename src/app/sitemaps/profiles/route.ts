import { creatorSitemapPartitionLocations } from "@/lib/creator-sitemap-partitions";
import { renderSitemapIndex } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 300;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

export async function GET() {
  try {
    return new Response(renderSitemapIndex(creatorSitemapPartitionLocations(SITE, "overview")), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch {
    return new Response("Sitemap temporarily unavailable\n", {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
}
