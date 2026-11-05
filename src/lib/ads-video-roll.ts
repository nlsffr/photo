import {cookies} from "next/headers";
import {getAdsRuntime} from "@/lib/ads-runtime";
import {AD_CONSENT_COOKIE,parseAdConsent} from "@/lib/ads-contract";
import {adsDocumentParentOrigin} from "@/lib/ads-document-origin";
import {resolveAdPageContext} from "@/lib/ads-page-context";
import {getTrafficStarsRollSpot} from "@/lib/trafficstars-roll-registry";
import {buildExoclickVastDocument} from "@/lib/exoclick-vast";
import {exoclickCopy} from "@/lib/exoclick-copy";
import {adsCopy} from "@/lib/ads-copy";
import {isLocale} from "@/lib/i18n/config";
import {buildRetiredPostrollDocument} from "@/lib/ads-retired-postroll";

const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Robots-Tag":"noindex, nofollow",
  "X-Content-Type-Options":"nosniff","X-Frame-Options":"SAMEORIGIN","Referrer-Policy":"no-referrer"};
const deny=(status:number)=>new Response("",{status,headers});
const REQUIRED=["nonce","path","locale","device"];

/** Preroll remains gated. Retired postroll only releases an old page's controller. */
export async function serveVideoRoll(request:Request,mode:"preroll"|"postroll") {
  const url=new URL(request.url),origin=adsDocumentParentOrigin(request,url);
  if(!origin||request.headers.get("sec-fetch-site")!=="same-origin"
    ||(request.headers.has("origin")&&request.headers.get("origin")!==origin))return deny(403);
  const pairs=[...url.searchParams],values=Object.fromEntries(pairs),page=resolveAdPageContext(values.path);
  if(url.hash||url.search.length>4096||pairs.length!==REQUIRED.length||new Set(pairs.map(([key])=>key)).size!==pairs.length
    ||REQUIRED.some(key=>!(key in values))||pairs.some(([key])=>!REQUIRED.includes(key))
    ||!isLocale(values.locale)||!["desktop","mobile"].includes(values.device)||!/^[A-Za-z0-9_-]{1,100}$/.test(values.nonce)
    ||page?.kind!=="media")return deny(400);
  if(mode==="postroll") {
    const document=buildRetiredPostrollDocument(values.nonce,origin);
    return new Response(document.html,{headers:{...headers,"Content-Type":"text/html; charset=utf-8",
      "Content-Security-Policy":document.csp,"X-LFH-Ad-Retired":"postroll"}});
  }
  try {
    const jar=await cookies();
    if(parseAdConsent(jar.get(AD_CONSENT_COOKIE)?.value)!=="accepted")return deny(403);
    const config=await getAdsRuntime();
    if(!config.enabled||!config.effectiveEnabled||config.reason!=="eligible"||config.consent!=="accepted"
      ||config.profile!=="intensive"||config.placements.underVideo!==true)return deny(403);
    const spot=getTrafficStarsRollSpot(values.device as "desktop"|"mobile",mode);
    if(!spot)return deny(503);
    const copy=adsCopy[values.locale],cta=exoclickCopy[values.locale];
    const document=buildExoclickVastDocument({mode,kind:"linear",placement:"underVideo",nonce:values.nonce,
      parentOrigin:origin,consentValue:"v2:accepted",tagUrl:spot.tagUrl,sourceHosts:spot.sourceHosts,
      labels:{advertisement:copy.label,close:copy.close,skip:cta.skip,visit:cta.visit,play:cta.play}});
    return new Response(document.html,{headers:{...headers,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":document.csp}});
  }catch{return deny(503);}
}
