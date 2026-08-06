import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://77.73.70.23";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/connexion", "/inscription", "/identite"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
