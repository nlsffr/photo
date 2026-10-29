import { getSitemapMediaChunk } from "@/lib/sitemap-data";
import {
  MAX_MEDIA_SITEMAP_FILES,
  MEDIA_SITEMAP_CHUNK_SIZE,
} from "@/lib/seo-policy";
import { toMediaSitemapEntry } from "@/lib/sitemap-route";
import { renderMediaSitemap } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

/** Full catalog chunks — one slim query, no tag hydration or N+1 paging. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ chunk: string }> },
) {
  const { chunk: chunkRaw } = await ctx.params;
  if (!/^(0|[1-9]\d*)$/.test(chunkRaw)) {
    return new Response("Not found\n", { status: 404 });
  }

  const chunkIndex = Number(chunkRaw);
  if (
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex >= MAX_MEDIA_SITEMAP_FILES
  ) {
    return new Response("Not found\n", { status: 404 });
  }

  try {
    const items = await getSitemapMediaChunk(
      chunkIndex * MEDIA_SITEMAP_CHUNK_SIZE,
      MEDIA_SITEMAP_CHUNK_SIZE,
    );
    if (items.length === 0) return new Response("Not found\n", { status: 404 });

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
