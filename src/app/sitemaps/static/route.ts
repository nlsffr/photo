export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

const PATHS: { path: string; changefreq: string; priority: string }[] = [
  { path: "/", changefreq: "hourly", priority: "1.0" },
  { path: "/models", changefreq: "daily", priority: "0.9" },
  { path: "/trending-medias", changefreq: "hourly", priority: "0.8" },
  { path: "/most-liked", changefreq: "daily", priority: "0.8" },
  { path: "/feed", changefreq: "hourly", priority: "0.7" },
  { path: "/tiktok", changefreq: "hourly", priority: "0.7" },
  { path: "/pour-toi", changefreq: "hourly", priority: "0.7" },
  { path: "/random/medias", changefreq: "hourly", priority: "0.6" },
  { path: "/recherche", changefreq: "weekly", priority: "0.5" },
  { path: "/classements", changefreq: "daily", priority: "0.6" },
  { path: "/influenceuses-tendances", changefreq: "daily", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.3" },
  { path: "/dmca", changefreq: "monthly", priority: "0.3" },
  { path: "/trust-and-safety", changefreq: "monthly", priority: "0.3" },
  { path: "/contact", changefreq: "monthly", priority: "0.3" },
  { path: "/conditions", changefreq: "monthly", priority: "0.2" },
  { path: "/confidentialite", changefreq: "monthly", priority: "0.2" },
  { path: "/mentions-legales", changefreq: "monthly", priority: "0.2" },
];

export async function GET() {
  const now = new Date().toISOString();
  const urls = PATHS.map(
    (p) => `  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
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
