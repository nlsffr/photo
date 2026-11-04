"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AD_CONSENT_COOKIE, AD_CONSENT_MAX_AGE, AD_CONSENT_VERSION, AD_PLACEMENT_KEYS, effectiveAdPlacements, profileAllowsAdPlacement, type AdConsent, type AdPlacement, type AdPlacements, type AdsRuntime } from "@/lib/ads-contract";
import { canServeAds, isAdPagePath, parseAdsRuntime, parseBrowserAdConsent } from "@/lib/ads-client-policy";
import { useAgeConfirmation } from "./AgeConfirmation";
import { useSession } from "./Session";
import { usePremium } from "./Premium";
import {probeAdMediation} from "@/lib/ads-mediation";
import type {AdMediation} from "@/lib/ads-provider-plan";
import { createAdSdkGuard } from "@/lib/ads-sdk";
import { isAdsRegistryReady, type AdDevice } from "@/lib/ads-registry";

export const ADS_CONSENT_CHANGED = "lfh:ad-consent-changed";
const POLL_MS = 15_000;
const RUNTIME_MAX_AGE_MS = POLL_MS + 5_000;
const REGISTRY_PLACEMENTS = Object.fromEntries(AD_PLACEMENT_KEYS.map(key => [key,true])) as AdPlacements;

export function browserAdConsent(): AdConsent {
  return parseBrowserAdConsent(document.cookie);
}

type AdsContext = {
  runtime: AdsRuntime | null;
  mediation: AdMediation | null;
  consent: AdConsent;
  consentAvailable: boolean;
  consentOffered: boolean;
  needsConsent: boolean;
  canServe: (placement: AdPlacement) => boolean;
  markSdkStarted: (device: AdDevice) => boolean;
  choose: (choice: Exclude<AdConsent, null>) => Promise<boolean>;
};
const Context = createContext<AdsContext | null>(null);
const CLOSED: AdsContext = { runtime:null, mediation:null, consent:null, consentAvailable:false, consentOffered:false, needsConsent:false, canServe:()=>false, markSdkStarted:()=>false, choose:async()=>false };

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { confirmed } = useAgeConfirmation();
  const { loading, user } = useSession();
  const { ready, isPremium } = usePremium();
  const [runtime, setRuntime] = useState<AdsRuntime | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [receivedContext, setReceivedContext] = useState("");
  const [consent, setConsent] = useState<AdConsent>(null);
  const [resolution, setResolution] = useState<"pending"|"ready"|"unavailable">("pending");
  const [mediationChoice,setMediationChoice] = useState<{context:string;value:AdMediation}|null>(null);
  const requestNumber = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const lastValid = useRef<{runtime:AdsRuntime;receivedAt:number;context:string}|null>(null);
  const sdkGuard = useRef(createAdSdkGuard(() => window.location.reload()));
  const sessionContext = `${loading}:${user?.id ?? "guest"}:${ready}:${isPremium}`;

  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 4_000);
    try {
      const response = await fetch("/api/ads/runtime", { cache:"no-store", credentials:"same-origin", signal:abort.signal });
      let next: AdsRuntime | null = null;
      // A response that explicitly fails or cannot be parsed is not a transport failure.
      if (response.ok) { try { next = parseAdsRuntime(await response.json()); } catch { /* Fail closed. */ } }
      if (request !== requestNumber.current) return;
      if (abort.signal.aborted) next = null;
      const at = next ? Date.now() : 0;
      lastValid.current = next ? {runtime:next,receivedAt:at,context:sessionContext} : null;
      setRuntime(next); setReceivedAt(at); setFresh(Boolean(next)); setReceivedContext(sessionContext);
      setResolution(next ? "ready" : "unavailable"); setConsent(browserAdConsent());
    } catch {
      if (request !== requestNumber.current) return;
      const previous = lastValid.current;
      if (previous && previous.context === sessionContext && Date.now() < previous.receivedAt + RUNTIME_MAX_AGE_MS) {
        // Reuse only the original validity window; errors never move its deadline.
        setRuntime(previous.runtime); setReceivedAt(previous.receivedAt); setFresh(true);
        setReceivedContext(previous.context); setResolution("ready");
      } else {
        lastValid.current = null;
        setRuntime(null); setReceivedAt(0); setFresh(false); setReceivedContext(sessionContext); setResolution("unavailable");
      }
    } finally { window.clearTimeout(timeout); }
  }, [sessionContext]);

  useEffect(() => {
    const update = () => { setConsent(browserAdConsent()); void refresh(); };
    update();
    const interval = window.setInterval(update, POLL_MS);
    window.addEventListener(ADS_CONSENT_CHANGED, update);
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      controller.current?.abort(); window.clearInterval(interval);
      window.removeEventListener(ADS_CONSENT_CHANGED, update); window.removeEventListener("storage", update);
      window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update);
    };
  }, [refresh, pathname, user?.id, loading, ready, isPremium]);

  useEffect(() => {
    if (!receivedAt) return;
    const timer = window.setTimeout(() => setFresh(false), Math.max(0, receivedAt + RUNTIME_MAX_AGE_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [receivedAt]);

  const runtimeFresh = receivedContext === sessionContext && fresh && receivedAt > 0;
  const configured = isAdsRegistryReady(effectiveAdPlacements(runtime?.profile, REGISTRY_PLACEMENTS));
  const allowed = canServeAds({ runtime, ageConfirmed:confirmed, consent, sessionLoading:loading,
    premiumReady:ready, isPremium, pathname, fresh:runtimeFresh });
  const eligibleNow = useRef<()=>boolean>(()=>false);
  useEffect(() => {
    eligibleNow.current = () => allowed && browserAdConsent() === "accepted" && Date.now() < receivedAt + RUNTIME_MAX_AGE_MS;
    return () => { eligibleNow.current = () => false; };
  }, [allowed,receivedAt]);
  const mediation = runtime?.profile === "intensive" ? (mediationChoice?.context === sessionContext ? mediationChoice.value : null) : "standard";
  useEffect(() => {
    if (!allowed || runtime?.profile !== "intensive" || mediationChoice?.context === sessionContext) return;
    const abort = new AbortController();
    void probeAdMediation(() => eligibleNow.current(), abort.signal).then(value => {
      if (value && !abort.signal.aborted && eligibleNow.current()) setMediationChoice({context:sessionContext,value});
    });
    return () => abort.abort();
  }, [allowed,runtime?.profile,sessionContext,mediationChoice,receivedAt]);
  useEffect(() => {
    const media = matchMedia("(min-width: 1024px)");
    const check = () => { sdkGuard.current.check(allowed, runtime?.revision ?? -1, media.matches ? "desktop" : "mobile"); };
    check(); media.addEventListener("change", check);
    return () => media.removeEventListener("change", check);
  }, [allowed, runtime?.revision]);

  const choose = useCallback(async (choice: Exclude<AdConsent, null>) => {
    if (confirmed !== true) return false;
    if (choice === "refused") {
      document.cookie = `${AD_CONSENT_COOKIE}=${AD_CONSENT_VERSION}:refused; Path=/; SameSite=Lax; Max-Age=${AD_CONSENT_MAX_AGE}${location.protocol === "https:" ? "; Secure" : ""}`;
      setConsent("refused");
    }
    try {
      const response = await fetch("/api/ads/consent", { method:"POST", credentials:"same-origin", cache:"no-store", keepalive:true,
        headers:{"Content-Type":"application/json"}, body:JSON.stringify({ choice, ageConfirmed:true, version:AD_CONSENT_VERSION }) });
      if (!response.ok) throw new Error("choice_failed");
      try { localStorage.setItem("lfh:ad-choice-update", String(Date.now())); } catch { /* Cookie remains authoritative. */ }
      window.dispatchEvent(new Event(ADS_CONSENT_CHANGED));
      return true;
    } catch { return choice === "refused"; }
  }, [confirmed]);

  // Explain both purposes in the entry panel before the age-confirmation click.
  // Serving ads remains separately gated by confirmed === true in canServeAds.
  const consentAvailable = runtimeFresh && runtime?.enabled === true
    && ["eligible", "consent_required", "consent_refused"].includes(runtime.reason)
    && !loading && ready && !isPremium && isAdPagePath(pathname);
  const currentResolution = receivedContext === sessionContext ? resolution : "pending";
  // Disclosure may precede runtime resolution; it grants no permission to serve an ad.
  // An informed click can record both purposes without a later second dialog.
  const consentOffered = configured && isAdPagePath(pathname) && !(ready && isPremium)
    && (currentResolution === "pending" || (runtimeFresh && runtime?.enabled === true
      && ["eligible", "consent_required", "consent_refused"].includes(runtime.reason)));
  return <Context.Provider value={{ runtime, mediation, consent, consentAvailable, consentOffered, needsConsent:consentOffered && consent === null,
    canServe:placement => allowed && mediation !== null && Date.now() < receivedAt + RUNTIME_MAX_AGE_MS
      && profileAllowsAdPlacement(runtime?.profile, placement) && runtime?.placements[placement] === true && browserAdConsent() === "accepted",
    markSdkStarted:device => sdkGuard.current.start(device, runtime?.revision ?? -1), choose }}>
    {children}
  </Context.Provider>;
}

export function useAds(): AdsContext { return useContext(Context) ?? CLOSED; }
