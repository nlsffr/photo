import type { MetadataRoute } from "next";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // HTML utility pages stay crawlable so their page-level noindex can
        // actually be observed. Only machine endpoints are excluded here.
        disallow: ["/api/"],
      },
    ],
    // Index découpé (rapide) — pas le monolithe /sitemap.xml
    sitemap: `${SITE}/sitemaps`,
    host: SITE.replace(/^https?:\/\//, ""),
  };
}
