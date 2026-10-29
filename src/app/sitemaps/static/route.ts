import { STATIC_SITEMAP_ENTRIES } from "@/lib/seo-policy";

export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

export async function GET() {
  const urls = STATIC_SITEMAP_ENTRIES.map(
    (p) => `  <url>
    <loc>${SITE}${p.path}</loc>
    <changefreq>${p.changeFrequency}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
  ).join("\n");

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
