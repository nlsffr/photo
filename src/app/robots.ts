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
        disallow: [
          "/api/",
          "/connexion",
          "/inscription",
          "/identite",
          "/favoris",
          "/premium",
        ],
      },
    ],
    // Index multi-fichiers (comme leakgallery) + sitemap unique de secours
    sitemap: [`${SITE}/sitemaps`, `${SITE}/sitemap.xml`],
    host: SITE.replace(/^https?:\/\//, ""),
  };
}
