import { getSitemapMediaChunk } from "@/lib/sitemap-data";
import {
  MAX_MEDIA_SITEMAP_FILES,
  MEDIA_SITEMAP_CHUNK_SIZE,
} from "@/lib/seo-policy";
import { mediaHref, toIso } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Full catalog chunks — one slim query, no tag hydration or N+1 paging. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ chunk: string }> | { chunk: string } },
) {
  const { chunk: chunkRaw } = await Promise.resolve(ctx.params);
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

    const now = new Date().toISOString();
    const entries = items.map((photo) => {
      const href = mediaHref(photo);
      const lastmod = toIso(photo.updatedAt) ?? now;
      return `  <url>
    <loc>${xmlEscape(`${SITE}${href}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    });

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;

    return new Response(body, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Sitemap temporarily unavailable\n", {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
}
