import { createAsyncTtlCache } from "@/lib/async-ttl-cache";
import { getSitemapProfiles } from "@/lib/sitemap-data";
import { creatorHref, toIso } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 3600;
const CACHE_TTL_MS = 60 * 60 * 1_000;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

const loadProfileSitemap = createAsyncTtlCache(async () => {
  const profiles = await getSitemapProfiles();
  const urls = profiles
    .map((profile) => {
      const href = creatorHref(profile.handle, profile.urlVersion);
      const lastmod = toIso(profile.updatedAt);
      return `  <url>
    <loc>${xmlEscape(`${SITE}${href}`)}</loc>
${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ""}    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return body;
}, CACHE_TTL_MS);

export async function GET() {
  let body: string;
  try {
    body = await loadProfileSitemap();
  } catch {
    return new Response("Sitemap temporarily unavailable\n", {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
