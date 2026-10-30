import { renderLocalizedStaticSitemapXml } from "@/lib/i18n/sitemap";

export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

export async function GET() {
  const body = renderLocalizedStaticSitemapXml(SITE);

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
