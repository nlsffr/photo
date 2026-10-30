import { loadCreatorSitemap } from "@/lib/creator-sitemap-data";
import {
  isCreatorSitemapCollection,
  parseCreatorSitemapBucket,
} from "@/lib/creator-sitemap-partitions";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(
  _request: Request,
  context: { params: Promise<{ collection: string; bucket: string }> },
) {
  const { collection, bucket: rawBucket } = await context.params;
  const bucket = parseCreatorSitemapBucket(rawBucket);
  if (!isCreatorSitemapCollection(collection) || bucket === null) {
    return new Response("Not found\n", { status: 404 });
  }

  try {
    return new Response(await loadCreatorSitemap(collection, bucket), {
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
