import { loadCreatorSitemap } from "@/lib/creator-sitemap-data";
import type { CreatorCollection } from "@/lib/creator-collections";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const COLLECTIONS = new Set<CreatorCollection>(["photos", "videos", "popular"]);

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
    return new Response(await loadCreatorSitemap(collection), {
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
