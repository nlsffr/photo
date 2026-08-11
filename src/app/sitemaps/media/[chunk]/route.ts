import { getPhotos } from "@/lib/photos";
import { mediaHref } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

const MEDIA_CHUNK = 10_000;
const PAGE = 500;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ chunk: string }> | { chunk: string } },
) {
  const { chunk: chunkRaw } = await Promise.resolve(ctx.params);
  const chunkIndex = Math.max(0, parseInt(chunkRaw, 10) || 0);
  const offsetStart = chunkIndex * MEDIA_CHUNK;
  const offsetEnd = offsetStart + MEDIA_CHUNK;
  const now = new Date().toISOString();

  const entries: string[] = [];
  const seen = new Set<string>();
  let cursor = offsetStart;

  try {
    while (cursor < offsetEnd) {
      const limit = Math.min(PAGE, offsetEnd - cursor);
      const page = await getPhotos({
        sort: "recent",
        limit,
        cursor,
      });
      if (!page.items.length) break;

      for (const p of page.items) {
        const href = mediaHref(p);
        if (seen.has(href)) continue;
        seen.add(href);
        entries.push(
          `  <url>
    <loc>${SITE}${href}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`,
        );
      }

      if (page.nextCursor == null) break;
      cursor = page.nextCursor;
    }
  } catch {
    // empty
  }

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
}
