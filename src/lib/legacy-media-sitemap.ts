export function redirectLegacyMediaSitemap(site: string): Response {
  const canonicalSite = site.replace(/\/$/, "");
  return new Response(null, {
    status: 308,
    headers: {
      Location: `${canonicalSite}/sitemap.xml`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
