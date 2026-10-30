import { loadCreatorSitemap } from "@/lib/creator-sitemap-data";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET() {
  try {
    return new Response(await loadCreatorSitemap("overview"), {
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
