import { createHash } from "node:crypto";

export type ExoclickBannerPlacement = "header" | "footer" | "underVideo";
export type ExoclickBannerOptions = {
  placement: ExoclickBannerPlacement;
  spot: { zoneId: number; width: number; height: number };
  parentOrigin: string;
  consentValue: "v2:accepted";
  nonce: string;
  labels: { advertisement: string; unavailable: string };
};

function validOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password) return false;
    return value === "https://leakfanhub.com"
      || (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost"));
  } catch { return false; }
}

const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim())
  && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);
const hash = (value: string) => createHash("sha256").update(value).digest("base64");

/** The caller supplies its registered zone; this helper accepts no vendor URL or code. */
export function buildExoclickBannerDocument(options: ExoclickBannerOptions): { html: string; csp: string } {
  const spot = options?.spot;
  if (!options || !["header", "footer", "underVideo"].includes(options.placement)
    || !spot || !Number.isSafeInteger(spot.zoneId) || spot.zoneId < 1
    || ![[728, 90], [300, 250], [300, 100]].some(([width, height]) => spot.width === width && spot.height === height)
    || typeof options.parentOrigin !== "string" || !validOrigin(options.parentOrigin)
    || options.consentValue !== "v2:accepted" || typeof options.nonce !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(options.nonce)
    || !text(options.labels?.advertisement) || !text(options.labels?.unavailable)) throw new Error("invalid_exoclick_banner");

  const src = `https://a.magsrv.com/iframe.php?idzone=${spot.zoneId}&size=${spot.width}x${spot.height}`;
  const config = JSON.stringify({ placement: options.placement, parentOrigin: options.parentOrigin, nonce: options.nonce,
    consentValue: options.consentValue, width: spot.width, height: spot.height, src, label: options.labels.advertisement })
    .replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const boot = `(()=>{
const config=${config};
if(parent===window||location.origin!==config.parentOrigin)return;
const root=document.getElementById("lfh-exo"),fallback=document.getElementById("lfh-status");
let visible=false,started=false,loaded=false,disposed=false,frame=null,timer=null;
const tell=status=>parent.postMessage({type:"lfh-ad-status",placement:config.placement,nonce:config.nonce,status},config.parentOrigin);
const accepted=()=>{try{const key="lfh_ad_consent=";const entry=document.cookie.split(";").map(value=>value.trim()).find(value=>value.startsWith(key));return Boolean(entry&&decodeURIComponent(entry.slice(key.length))===config.consentValue);}catch{return false;}};
function dispose(){if(disposed)return;disposed=true;if(timer!==null)clearTimeout(timer);if(frame)frame.remove();frame=null;root.hidden=true;window.removeEventListener("message",message);window.removeEventListener("pagehide",hide);window.removeEventListener("pageshow",update);document.removeEventListener("visibilitychange",update);}
function empty(){if(disposed)return;dispose();fallback.hidden=false;tell("empty");}
function update(){
 if(disposed)return;
 if(!accepted()){empty();return;}
 root.hidden=!visible||document.visibilityState!=="visible";
 if(root.hidden||started)return;
 started=true;
 const next=document.createElement("iframe");frame=next;
 next.width=String(config.width);next.height=String(config.height);next.title=config.label;
 next.referrerPolicy="strict-origin-when-cross-origin";
 next.setAttribute("sandbox","allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
 next.onload=()=>{if(disposed||loaded||frame!==next)return;if(!accepted()){empty();return;}loaded=true;if(timer!==null)clearTimeout(timer);tell("loaded");};
 next.onerror=()=>{if(!loaded&&frame===next)empty();};
 timer=setTimeout(()=>{if(!loaded&&frame===next)empty();},10000);
 next.src=config.src;root.appendChild(next);
}
function message(event){const data=event.data;if(event.source!==parent||event.origin!==config.parentOrigin||!data||typeof data!=="object"||Array.isArray(data)||data.type!=="lfh-ad-visibility"||data.placement!==config.placement||data.nonce!==config.nonce||typeof data.visible!=="boolean")return;visible=data.visible;update();}
function hide(event){if(event.persisted){root.hidden=true;return;}dispose();}
window.addEventListener("message",message);window.addEventListener("pagehide",hide);window.addEventListener("pageshow",update);document.addEventListener("visibilitychange",update);
})();`;
  const style = "html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}body{font:12px system-ui;color:#999}[hidden]{display:none!important}#lfh-exo{display:flex;width:100%;height:100%;align-items:flex-start;justify-content:center}iframe{border:0;flex:none}#lfh-status{margin:0;text-align:center}";
  const csp = ["default-src 'none'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'self'", "form-action 'none'",
    `script-src 'sha256-${hash(boot)}'`, `style-src 'sha256-${hash(style)}'`, "frame-src https://a.magsrv.com"].join("; ");
  const label = escapeHtml(options.labels.advertisement);
  return { csp, html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label}</title><style>${style}</style></head><body><div id="lfh-exo" aria-label="${label}" hidden></div><p id="lfh-status" role="status" hidden>${escapeHtml(options.labels.unavailable)}</p><script>${boot}</script></body></html>` };
}
