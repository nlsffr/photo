import { getAdsRuntime } from '@/lib/ads-runtime';
import { buildAdsEmbedDocument } from '@/lib/ads-embed-document';
import { selectAdProvider } from '@/lib/ads-provider-plan';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'no-referrer'};
const deny=(status:number)=>new Response('',{status,headers});
export async function GET(request:Request) {
  const url=new URL(request.url),pairs=[...url.searchParams];
  const placement=url.searchParams.get('placement'),device=url.searchParams.get('device');
  const ordinal=url.searchParams.get('ordinal');
  if(url.hash || url.search.length>128 || new Set(pairs.map(([key])=>key)).size!==pairs.length
    || pairs.length!==(ordinal===null?2:3) || pairs.some(([key])=>!['placement','device','ordinal'].includes(key))
    || (ordinal!==null && (placement!=='feed' || !/^(?:0|[1-9]\d{0,6})$/.test(ordinal) || Number(ordinal)>1_000_000))
    || !['header','footer','underVideo','feed'].includes(placement??'') || !['desktop','mobile'].includes(device??'')) return deny(400);
  try {
    const config=await getAdsRuntime();
    if(!config.enabled || !config.effectiveEnabled || !config.placements[placement as 'header'|'footer'|'underVideo'|'feed']) return deny(403);
    if(placement==='feed' && ordinal===null && config.profile && config.profile!=='current') return deny(400);
    if(selectAdProvider({profile:config.profile,placement:placement as 'header'|'footer'|'underVideo'|'feed',
      device:device as 'desktop'|'mobile',...(placement==='feed'?{ordinal:Number(ordinal??0)}:{})})!=='trafficstars') return deny(403);
    const document=buildAdsEmbedDocument(placement as 'header'|'footer'|'underVideo'|'feed',device as 'desktop'|'mobile',config.profile);
    return new Response(document.html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':document.csp}});
  } catch { return deny(503); }
}
