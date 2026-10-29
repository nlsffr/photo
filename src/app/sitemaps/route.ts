export const dynamic = "force-dynamic";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(
  /\/$/,
  "",
);

export async function GET() {
  return new Response(null, {
    status: 308,
    headers: {
      Location: `${SITE}/sitemap.xml`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
