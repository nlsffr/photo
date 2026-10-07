import { getModels } from "@/lib/photos";
import { creatorHref, toIso } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}

export async function GET() {
  const now = new Date().toISOString();
  let models: {
    handle: string;
    urlVersion?: number;
    updatedAt?: string | null;
    removedFromIndexAt?: string | null;
  }[] = [];
  try {
    models = await getModels("followers");
  } catch {
    models = [];
  }

  const urls = models
    .filter((m) => !m.removedFromIndexAt)
    .map((m) => {
      const href = creatorHref(m.handle, m.urlVersion);
      const lastmod = toIso(m.updatedAt) ?? now;
      return `  <url>
    <loc>${xmlEscape(`${SITE}${href}`)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
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
