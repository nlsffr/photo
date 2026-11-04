import type { AdPlacement } from "./ads-contract";
import type { AdSpot } from "./ads-registry";
import { isValidAdSpot } from "./ads-registry-data.mjs";
import type { AdDevice } from "./ads-registry";

/** A global SDK cannot be remounted safely without unloading its listeners. */
export function createAdSdkGuard(reload: () => void) {
  let loaded: {device:AdDevice;revision:number} | null = null;
  let reloading = false;
  const invalidate = () => { if (loaded && !reloading) { reloading = true; reload(); } return false; };
  return {
    start(device: AdDevice, revision: number) {
      if (reloading) return false;
      if (loaded && (loaded.device !== device || loaded.revision !== revision)) return invalidate();
      loaded = {device,revision}; return true;
    },
    check(allowed: boolean, revision: number, device: AdDevice) {
      if (loaded && (!allowed || loaded.revision !== revision || loaded.device !== device)) return invalidate();
      return !reloading;
    },
  };
}

const SCRIPT_HOSTS = new Set(["cdn.tsyndicate.com", "cdn.fozekikikiminu.com"]);
function validSdkUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && SCRIPT_HOSTS.has(url.hostname)
    && /^\/sdk\/v1\/(?:dd\.)?(?:ms|p|interstitial\.ts|video\.shorts|video\.instant\.message)\.js$/.test(url.pathname)
    && !url.port && !url.search && !url.hash && !url.username && !url.password; } catch { return false; }
}
const loaded = new Map<string, Promise<void>>();
type VendorWindow = Window & {
  InterstitialTsAd?: (options: Record<string, unknown>) => void;
  TSVideoInstantMessage?: (options: Record<string, unknown>) => void;
  TSVideoShorts?: (options: Record<string, unknown>) => void;
};

function loadScript(file: string, permitted: () => boolean): Promise<void> {
  const existing = loaded.get(file);
  if (existing) return existing;
  if (!permitted() || !validSdkUrl(file)) return Promise.reject(new Error("ads_not_allowed"));
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = file; script.async = true; script.dataset.lfhAdSdk = file;
    script.onload = () => resolve(); script.onerror = () => { script.remove(); loaded.delete(file); reject(new Error("ads_sdk_unavailable")); };
    document.head.appendChild(script);
  });
  loaded.set(file, promise);
  return promise;
}

/** Called only after current server eligibility, separate consent and age checks. */
export function mountTrafficStarsAd(options: {
  placement: AdPlacement; spot: AdSpot; container: HTMLElement;
  permitted: () => boolean; onStart: () => void | boolean;
}): () => void {
  const { placement, spot, container, permitted, onStart } = options;
  if (!permitted() || !isValidAdSpot(spot)) return () => {};
  let disposed = false;
  const allowed = () => !disposed && container.isConnected && permitted();
  let removeClick: (() => void) | undefined;
  let script: HTMLScriptElement | undefined;
  const subid = `lfh_${placement}_${matchMedia("(min-width: 1024px)").matches ? "desktop" : "mobile"}`;
  const appendSpotScript = () => {
    const url = spot.scriptUrl!;
    if (!allowed() || !validSdkUrl(url)) return;
    if (onStart() === false) return;
    script = document.createElement("script"); script.async = true; script.defer = true; script.src = url;
    script.dataset.tsSpot = spot.spotId; script.dataset.tsSubid = subid;
    script.dataset.tsAutoXu = "false";
    if (spot.domain) script.dataset.tsDomain = spot.domain;
    if (placement === "popunder") {
      script.dataset.tsSessionDuration = String(spot.sessionDuration ?? 300);
      script.dataset.tsCount = String(spot.count ?? 1); script.dataset.tsFirstDelay = String(spot.firstDelay ?? 5);
      script.dataset.tsDelay = String(spot.delay ?? 60); script.dataset.tsMode = spot.mode ?? "selective";
      if (spot.devices && spot.devices !== "all") script.dataset.tsDevices = spot.devices;
    }
    container.appendChild(script);
  };
  if (spot.kind === "banner") appendSpotScript();
  else if (spot.kind === "popunder") {
    const click = (event: MouseEvent) => {
      if (!event.isTrusted || !allowed()) return;
      removeClick?.(); appendSpotScript();
    };
    document.addEventListener("click", click);
    removeClick = () => document.removeEventListener("click", click);
  } else {
    if (onStart() === false) return () => {};
    const file = spot.scriptUrl!;
    if (spot.kind === "interstitial" && allowed() && !document.querySelector('link[data-lfh-ad-style="interstitial"]')) {
      const style = document.createElement("link"); style.rel = "stylesheet";
      style.href = spot.styleUrl!; style.dataset.lfhAdStyle = "interstitial";
      document.head.appendChild(style);
    }
    void loadScript(file, allowed).then(() => {
      if (!allowed()) return;
      const vendor = window as VendorWindow;
      if (spot.kind === "feed") vendor.TSVideoShorts?.({ spot:spot.spotId, containerId:container.id, inFeed:true, subid, autoXu:false });
      else if (spot.kind === "slider") vendor.TSVideoInstantMessage?.({ spot:spot.spotId, subid, width:spot.width, mobileWidth:spot.mobileWidth, displayMode:spot.displayMode, cappedAction:spot.cappedAction, cappedValueInMinutes:spot.cappedValueInMinutes, closeButtonDelay:spot.closeButtonDelay, showCTAButton:spot.showCTAButton, hideOnComplete:spot.hideOnComplete, autoXu:false });
      else vendor.InterstitialTsAd?.({ spot:spot.spotId, subid, domain:spot.domain, countdown:spot.countdown, countClicks:spot.countClicks, cookieName:"lfh_ts_interstitial_v1", cookieExpires:spot.cookieExpires, autoXu:false });
    }).catch(() => { /* A failed ad never blocks media or retries in a loop. */ });
  }
  return () => { disposed = true; removeClick?.(); script?.remove(); container.replaceChildren(); };
}
