import { getAdsRuntime } from '@/lib/ads-runtime';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {
  return Response.json(await getAdsRuntime(),{headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'}});
}
