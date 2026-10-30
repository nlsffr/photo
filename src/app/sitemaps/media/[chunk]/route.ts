import { redirectLegacyMediaSitemap } from "@/lib/legacy-media-sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

/** Legacy offset chunks redirect crawlers to the stable keyset index. */
export function GET() {
  return redirectLegacyMediaSitemap(SITE);
}
