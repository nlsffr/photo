import { getPhotos } from "@/lib/photos";
import { mediaHref } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

/** Top media by views — listed early in sitemap index. */
const LIMIT = 2_000;
const PAGE = 250;

export async function GET() {
  const now = new Date().toISOString();
  const entries: string[] = [];
  const seen = new Set<string>();
  let cursor: number | undefined;
  let count = 0;

  try {
    while (count < LIMIT) {
      const limit = Math.min(PAGE, LIMIT - count);
      const page = await getPhotos({
        sort: "popular",
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
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`,
        );
        count++;
        if (count >= LIMIT) break;
      }

      if (page.nextCursor == null) break;
      cursor = page.nextCursor;
    }
  } catch {
    // empty ok
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
