import { getPhotos } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

const MEDIA_CHUNK = 10_000;
const MAX_MEDIA_FILES = 50;

/** Sitemap index (leakgallery-style): static + profiles + tags + media chunks. */
export async function GET() {
  const now = new Date().toISOString();

  let total = 0;
  try {
    const page = await getPhotos({ sort: "recent", limit: 1, cursor: 0 });
    total = Number(page.total) || 0;
  } catch {
    total = 0;
  }

  const mediaFiles = Math.min(
    MAX_MEDIA_FILES,
    Math.max(1, Math.ceil(Math.max(total, 1) / MEDIA_CHUNK)),
  );

  const locs = [
    `${SITE}/sitemaps/static`,
    `${SITE}/sitemaps/profiles`,
    `${SITE}/sitemaps/tags`,
    ...Array.from({ length: mediaFiles }, (_, i) => `${SITE}/sitemaps/media/${i}`),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    locs
      .map(
        (loc) =>
          `  <sitemap>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`,
      )
      .join("\n") +
    `\n</sitemapindex>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
