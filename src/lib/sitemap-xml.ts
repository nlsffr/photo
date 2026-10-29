export type MediaSitemapEntry = {
  canonicalUrl: string;
  lastmod?: string | null;
  type: "photo" | "video" | "pack";
  title?: string | null;
  description?: string | null;
  creatorHandle: string;
  publicId: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  createdAt?: string | null;
  durationSec?: number | null;
  views?: number | null;
  indexable: boolean;
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bounded(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function httpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

function kindLabel(type: MediaSitemapEntry["type"]): string {
  if (type === "video") return "Video";
  if (type === "pack") return "Gallery";
  return "Photo";
}

function renderMediaUrl(entry: MediaSitemapEntry): string | null {
  if (!entry.indexable) return null;
  const canonicalUrl = httpUrl(entry.canonicalUrl);
  if (!canonicalUrl) return null;
  const lastmod = isoDate(entry.lastmod);
  const imageUrl = httpUrl(entry.imageUrl);
  const videoUrl = httpUrl(entry.videoUrl);
  const publicationDate = isoDate(entry.createdAt);
  const name = bounded(
    plainText(entry.title) ||
      `${entry.creatorHandle} ${kindLabel(entry.type).toLowerCase()} #${entry.publicId}`,
    160,
  );
  const description = bounded(
    plainText(entry.description) ||
      `${kindLabel(entry.type)} by @${entry.creatorHandle} on LeakFanHub (media ${entry.publicId}).`,
    2_048,
  );
  const duration = Number(entry.durationSec);
  const views = Number(entry.views);
  const lines = ["  <url>", `    <loc>${xmlEscape(canonicalUrl)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
  if (imageUrl) {
    lines.push(
      "    <image:image>",
      `      <image:loc>${xmlEscape(imageUrl)}</image:loc>`,
      "    </image:image>",
    );
  }
  if (entry.type === "video" && imageUrl && videoUrl && publicationDate) {
    lines.push(
      "    <video:video>",
      `      <video:thumbnail_loc>${xmlEscape(imageUrl)}</video:thumbnail_loc>`,
      `      <video:title>${xmlEscape(name)}</video:title>`,
      `      <video:description>${xmlEscape(description)}</video:description>`,
      `      <video:content_loc>${xmlEscape(videoUrl)}</video:content_loc>`,
      `      <video:publication_date>${publicationDate}</video:publication_date>`,
    );
    if (Number.isFinite(duration) && duration >= 1 && duration <= 28_800) {
      lines.push(`      <video:duration>${Math.round(duration)}</video:duration>`);
    }
    if (Number.isFinite(views) && views >= 0) {
      lines.push(`      <video:view_count>${Math.floor(views)}</video:view_count>`);
    }
    lines.push("    </video:video>");
  }
  lines.push("  </url>");
  return lines.join("\n");
}

export function renderMediaSitemap(entries: MediaSitemapEntry[]): string {
  const urls = entries
    .map(renderMediaUrl)
    .filter((entry): entry is string => entry !== null);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls.join("\n")}
</urlset>
`;
}

export function renderSitemapIndex(locations: string[]): string {
  const sitemaps = locations
    .map(httpUrl)
    .filter((location): location is string => Boolean(location))
    .map(
      (location) =>
        `  <sitemap>\n    <loc>${xmlEscape(location)}</loc>\n  </sitemap>`,
    );
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.join("\n")}
</sitemapindex>
`;
}
