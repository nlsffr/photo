import { getAllTags } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

export async function GET() {
  const now = new Date().toISOString();
  let tags: string[] = [];
  try {
    tags = (await getAllTags()).slice(0, 5000);
  } catch {
    tags = [];
  }

  const urls = tags
    .map(
      (t) => `  <url>
    <loc>${SITE}/tag/${encodeURIComponent(t)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.5</priority>
  </url>`,
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
