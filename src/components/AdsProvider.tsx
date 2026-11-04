"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AD_CONSENT_COOKIE, AD_CONSENT_MAX_AGE, type AdConsent, type AdPlacement, type AdsRuntime } from "@/lib/ads-contract";
import { canServeAds, isAdPagePath, parseAdsRuntime, parseBrowserAdConsent } from "@/lib/ads-client-policy";
import { useAgeConfirmation } from "./AgeConfirmation";
import { useSession } from "./Session";
import { usePremium } from "./Premium";
import { createAdSdkGuard } from "@/lib/ads-sdk";
import type { AdDevice } from "@/lib/ads-registry";

export const ADS_CONSENT_CHANGED = "lfh:ad-consent-changed";
const POLL_MS = 15_000;

export function browserAdConsent(): AdConsent {
  return parseBrowserAdConsent(document.cookie);
}

type AdsContext = {
  runtime: AdsRuntime | null;
  consent: AdConsent;
  consentAvailable: boolean;
  needsConsent: boolean;
  canServe: (placement: AdPlacement) => boolean;
  markSdkStarted: (device: AdDevice) => boolean;
  choose: (choice: Exclude<AdConsent, null>) => Promise<boolean>;
};
const Context = createContext<AdsContext | null>(null);
const CLOSED: AdsContext = { runtime:null, consent:null, consentAvailable:false, needsConsent:false, canServe:()=>false, markSdkStarted:()=>false, choose:async()=>false };

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
  const requestNumber = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const sdkGuard = useRef(createAdSdkGuard(() => window.location.reload()));
  const sessionContext = `${loading}:${user?.id ?? "guest"}:${ready}:${isPremium}`;

  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 4_000);
    try {
      const response = await fetch("/api/ads/runtime", { cache:"no-store", credentials:"same-origin", signal:abort.signal });
      const next = response.ok ? parseAdsRuntime(await response.json()) : null;
      if (request !== requestNumber.current || abort.signal.aborted) return;
      setRuntime(next); setReceivedAt(next ? Date.now() : 0); setFresh(Boolean(next)); setReceivedContext(sessionContext); setConsent(browserAdConsent());
    } catch {
      if (request === requestNumber.current && !abort.signal.aborted) { setRuntime(null); setReceivedAt(0); setFresh(false); }
      else if (request === requestNumber.current && abort.signal.aborted) setFresh(false);
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
    const timer = window.setTimeout(() => setFresh(false), Math.max(0, receivedAt + POLL_MS + 5_000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [receivedAt]);

  const allowed = canServeAds({ runtime, ageConfirmed:confirmed, consent, sessionLoading:loading,
    premiumReady:ready, isPremium, pathname, fresh:receivedContext === sessionContext && fresh });
  useEffect(() => {
    const media = matchMedia("(min-width: 1024px)");
    const check = () => { sdkGuard.current.check(allowed, runtime?.revision ?? -1, media.matches ? "desktop" : "mobile"); };
    check(); media.addEventListener("change", check);
    return () => media.removeEventListener("change", check);
  }, [allowed, runtime?.revision]);

  const choose = useCallback(async (choice: Exclude<AdConsent, null>) => {
    if (confirmed !== true) return false;
    if (choice === "refused") {
      document.cookie = `${AD_CONSENT_COOKIE}=v1:refused; Path=/; SameSite=Lax; Max-Age=${AD_CONSENT_MAX_AGE}${location.protocol === "https:" ? "; Secure" : ""}`;
      setConsent("refused");
    }
    try {
      const response = await fetch("/api/ads/consent", { method:"POST", credentials:"same-origin", cache:"no-store", keepalive:true,
        headers:{"Content-Type":"application/json"}, body:JSON.stringify({ choice, ageConfirmed:true }) });
      if (!response.ok) throw new Error("choice_failed");
      try { localStorage.setItem("lfh:ad-choice-update", String(Date.now())); } catch { /* Cookie remains authoritative. */ }
      window.dispatchEvent(new Event(ADS_CONSENT_CHANGED));
      return true;
    } catch { return choice === "refused"; }
  }, [confirmed]);

  const consentAvailable = runtime?.enabled === true && ["eligible", "consent_required", "consent_refused"].includes(runtime.reason)
    && confirmed === true && !loading && ready && !isPremium && isAdPagePath(pathname);
  return <Context.Provider value={{ runtime, consent, consentAvailable, needsConsent:consentAvailable && consent === null,
    canServe:placement => allowed && runtime?.placements[placement] === true && browserAdConsent() === "accepted",
    markSdkStarted:device => sdkGuard.current.start(device, runtime?.revision ?? -1), choose }}>
    {children}
  </Context.Provider>;
}

export function useAds(): AdsContext { return useContext(Context) ?? CLOSED; }
