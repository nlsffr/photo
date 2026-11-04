import { createHash } from "node:crypto";
import { ADS_REGISTRY, isValidAdSpot } from "./ads-registry-data.mjs";
import type { AdSpot } from "./ads-registry";
import type { AdProfile } from "./ads-contract";
// @ts-expect-error Native Node tests require explicit suffixes.
import { AD_CONSENT_VERSION, isAdProfile } from "./ads-contract.ts";
// @ts-expect-error Native Node tests require explicit suffixes.
import { ADS_CSP } from "./ads-csp.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { adFormatPlacementFor, type AdPageContext } from './ads-page-context.ts';

type EmbedPlacement = "header" | "footer" | "underVideo" | "feed";
type EmbedDevice = "desktop" | "mobile";

/** A separate HTTP document keeps creative media permissions out of the main CSP.
 * SAMEORIGIN + allow-same-origin is required by this SDK's unguarded storage access.
 * This separates layout/CSP, not publisher data from the trusted SDK.
 */
export function buildAdsEmbedDocument(placement: EmbedPlacement, device: EmbedDevice, profile:AdProfile="current", page?:AdPageContext) {
  if (!["header", "footer", "underVideo", "feed"].includes(placement) || !["desktop", "mobile"].includes(device)) throw new Error("invalid_ad_embed");
  if (!isAdProfile(profile)) throw new Error("invalid_ad_profile");
  const spot = ADS_REGISTRY[adFormatPlacementFor(profile,placement,device,page)][device] as AdSpot;
  if (!isValidAdSpot(spot) || !["banner", "feed"].includes(spot.kind)) throw new Error("ad_embed_not_ready");
  const data = JSON.stringify({ placement, device, profile, kind:spot.kind, spotId:spot.spotId, domain:spot.domain,
    consentValue: `${AD_CONSENT_VERSION}:accepted`,
    scriptUrl:spot.scriptUrl || `https://cdn.tsyndicate.com/sdk/v1/${spot.kind === "banner" ? "ms" : "video.shorts"}.js` }).replace(/</g, "\\u003c");
  const boot = `(()=>{
const config=${data};
const tell=status=>parent.postMessage({type:"lfh-ad-status",placement:config.placement,status},location.origin);
const accepted=()=>{try{const value=document.cookie.split(";").map(entry=>entry.trim()).find(entry=>entry.startsWith("lfh_ad_consent="));return value&&decodeURIComponent(value.slice(15))===config.consentValue;}catch{return false;}};
if(!accepted()){tell("empty");return;}
const root=document.getElementById("lfh-ad");
const script=document.createElement("script");script.async=true;script.defer=true;script.src=config.scriptUrl;
script.dataset.tsSpot=config.spotId;script.dataset.tsSubid="lfh_"+(config.profile==="current"?"":config.profile+"_")+config.placement+"_"+config.device;
script.dataset.tsAutoXu="false";
if(config.domain)script.dataset.tsDomain=config.domain;
script.onerror=()=>finish("empty");
if(config.kind==="feed")script.onload=()=>{if(done||!accepted()||typeof window.TSVideoShorts!=="function"){tell("empty");return;}window.TSVideoShorts({spot:config.spotId,containerId:root.id,inFeed:true,subid:script.dataset.tsSubid,autoXu:false});};
let done=false,timer;const watched=new Set();
const cleanup=()=>{done=true;clearTimeout(timer);observer.disconnect();watched.forEach(scope=>["load","error","loadeddata"].forEach(name=>scope.removeEventListener(name,check,true)));};
const finish=status=>{if(!done){cleanup();tell(status);}};
const watch=scope=>{if(!watched.has(scope)){watched.add(scope);observer.observe(scope,{childList:true,subtree:true,attributes:true,attributeFilter:["style","src","class"]});["load","error","loadeddata"].forEach(name=>scope.addEventListener(name,check,true));}};
const scan=(scope,depth=0)=>{
  watch(scope);let pending=false;
  for(const element of scope.querySelectorAll("img,video,.mn-thumb__img,iframe,canvas")){
    if(element.clientWidth<=1||element.clientHeight<=1)continue;
    if(element.tagName==="IMG"){
      if(element.complete&&element.naturalWidth>1&&element.naturalHeight>1)return {filled:true};
      if(!element.complete&&element.getAttribute("src"))pending=true;
    }else if(element.tagName==="VIDEO"){
      if(element.readyState>=2)return {filled:true};
      if(element.getAttribute("src")||element.querySelector?.("source"))pending=true;
    }else if(element.tagName==="IFRAME"){
      try{const child=element.contentDocument;if(child&&depth<4){const result=scan(child,depth+1);if(result.filled)return result;pending=pending||result.pending||Boolean(element.getAttribute("src"));}else if(element.getAttribute("src"))pending=true;}catch{pending=true;}
    }else if(element.tagName==="CANVAS")pending=true;
    // NativeAdPreview assigns this background only after its detached image has loaded.
    else if(element.style.backgroundImage&&element.style.backgroundImage.startsWith("url("))return {filled:true};
    else pending=true;
  }
  return {filled:false,pending};
};
const check=()=>{if(done)return;if(!accepted()){finish("empty");return;}if(scan(root).filled)finish("filled");};
const observer=new MutationObserver(check);watch(root);window.addEventListener("pagehide",cleanup,{once:true});
root.appendChild(script);
timer=setTimeout(()=>{check();if(done)return;tell("pending");timer=setTimeout(()=>{check();if(!done)finish(scan(root).pending?"pending":"empty");},22000);},8000);
})();`;
  const hash = createHash("sha256").update(boot).digest("base64");
  const csp = ["default-src 'none'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'self'", "form-action 'none'",
    `script-src 'sha256-${hash}' ${ADS_CSP.script.join(" ")}`,
    `style-src 'unsafe-inline' ${ADS_CSP.style.join(" ")}`,
    `connect-src 'self' ${ADS_CSP.embedConnect.join(" ")}`,
    "worker-src blob:", "img-src 'self' data: https:", "media-src 'self' blob: https:", "frame-src 'self' https:", "upgrade-insecure-requests"].join("; ");
  return { csp, html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Advertisement</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}#lfh-ad{position:relative;width:100%;height:100%;display:flex;justify-content:center;align-items:flex-start}iframe{border:0}video{max-width:100%;max-height:100%;object-fit:contain}</style></head><body><div id="lfh-ad"></div><script>${boot}</script></body></html>` };
}
