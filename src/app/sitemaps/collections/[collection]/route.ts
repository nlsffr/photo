import { creatorSitemapPartitionLocations } from "@/lib/creator-sitemap-partitions";
import type { CreatorCollection } from "@/lib/creator-collections";
import { renderSitemapIndex } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const COLLECTIONS = new Set<CreatorCollection>(["photos", "videos", "popular"]);
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

export async function GET(
  _request: Request,
  context: { params: Promise<{ collection: string }> },
) {
  const { collection: rawCollection } = await context.params;
  if (!COLLECTIONS.has(rawCollection as CreatorCollection)) {
    return new Response("Not found\n", { status: 404 });
  }
  const collection = rawCollection as CreatorCollection;
  try {
    return new Response(renderSitemapIndex(creatorSitemapPartitionLocations(SITE, collection)), {
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
