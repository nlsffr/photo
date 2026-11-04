"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AdPlacement } from "@/lib/ads-contract";
import type { AdDevice } from "@/lib/ads-registry";
import { adSpotFor } from "@/lib/ads-profiles";
import { resolveAdPageContext } from "@/lib/ads-page-context";
import { stripLocalePrefix } from "@/lib/i18n/config";
import { selectAdProvider, type AdSlotContext } from "@/lib/ads-provider-plan";
import { getExoclickSpot } from "@/lib/exoclick-registry";
import { getExoclickGlobalSpot, mountExoclickGlobalAd } from "@/lib/exoclick-global";
import { mountTrafficStarsAd } from "@/lib/ads-sdk";
import { adsCopy } from "@/lib/ads-copy";
import { useAds } from "./AdsProvider";
import { useLocale } from "./LocaleProvider";
import { usePathname } from "next/navigation";
import { LocalizedLink as Link } from "./LocalizedLink";
import { usePremium } from "./Premium";
import { DISCOVERY_COPY } from "@/features/i18n/discovery-copy";
import { getPlan } from "@/lib/premium-plans";

type NetworkSlotProps = { placement: AdPlacement; className?: string; onEmpty?: () => void; loading?: "eager"|"lazy"; context?: AdSlotContext; ordinal?: number; layout?: "grid" };

function NetworkAdSlot({ placement, className = "", onEmpty, loading, context = "page", ordinal = 0, layout }: NetworkSlotProps) {
  const ads = useAds();
  const { locale } = useLocale();
  const path = usePathname();
  const container = useRef<HTMLDivElement>(null);
  const gridContainer = useRef<HTMLElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const frameTimer = useRef<number | undefined>(undefined);
  const frameFilled = useRef(false);
  const framePending = useRef(false);
  const failedFrame = useRef<string | null>(null);
  const sendVisibility = useRef<((element: HTMLIFrameElement) => void) | undefined>(undefined);
  const currentAds = useRef(ads);
  useEffect(() => { currentAds.current = ads; }, [ads]);
  const emptyHandler = useRef(onEmpty);
  useEffect(() => { emptyHandler.current = onEmpty; }, [onEmpty]);
  const [device, setDevice] = useState<AdDevice | null>(null);
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const id = `lfh-ad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const eligible = ads.canServe(placement);
  const profile = ads.runtime?.profile ?? "current";
  const revision = ads.runtime?.revision ?? 0;
  const global = ["popunder", "interstitial", "slider"].includes(placement);
  const mediation = profile === "intensive" ? ads.mediation : undefined;
  const provider = device ? selectAdProvider({profile, placement, device, context, ...(placement === "feed" ? {ordinal} : {}),
    ...(profile === "intensive" ? {mediation} : {})}) : null;
  const pageContext = resolveAdPageContext(path);
  const trafficSpot = device ? adSpotFor(profile, placement, device, pageContext ?? undefined) : null;
  const exoSpot = device && provider === "exoclick" ? getExoclickSpot(placement, device, context) : null;
  const globalExoSpot = global && device && provider === "exoclick" ? getExoclickGlobalSpot(placement, device) : null;
  const spot = provider === "exoclick" ? exoSpot : trafficSpot;
  // Correlation only, never a credential. React's ID is unique to this mounted slot.
  const nonce = `${id.slice(0, profile === "intensive" ? 24 : 40)}-${profile}-${revision}-${device}-${context}-${ordinal}-${locale}${profile === "intensive" ? `-${mediation ?? "standard"}` : ""}`;
  const exoQuery = new URLSearchParams({placement, device: device ?? "mobile", context, profile, nonce, path, locale});
  if (placement === "feed") exoQuery.set("ordinal", String(ordinal));
  if (profile === "intensive" && mediation) exoQuery.set("mediation", mediation);
  const frameSrc = !device || !provider ? undefined : provider === "exoclick"
    ? `/api/ads/exoclick?${exoQuery}` : `/api/ads/embed?placement=${placement}&device=${device}${placement === "feed" ? `&ordinal=${ordinal}` : ""}${profile === "intensive" ? `&path=${encodeURIComponent(path)}${mediation ? `&mediation=${mediation}` : ""}` : ""}`;
  const frameKey = `${frameSrc}:${profile}:${revision}`;
  const serving = eligible && failedKey !== frameKey;
  const gridSized = profile === "intensive" && layout === "grid" && placement === "underVideo" && spot?.kind === "banner"
    && typeof spot.width === "number" && spot.width > 0 && typeof spot.height === "number" && spot.height > 0;
  const gridReady = typeof gridWidth === "number" && Number.isFinite(gridWidth) && gridWidth > 0;
  const gridScale = gridSized && gridReady ? Math.min(1, gridWidth! / (spot.width as number)) : 1;
  const footerWrapper = profile === "intensive" && placement === "footer" && device === "desktop";
  const empty = useCallback(() => {
    if (failedFrame.current === frameKey) return;
    failedFrame.current = frameKey;
    window.clearTimeout(frameTimer.current);
    setFailedKey(frameKey);
    emptyHandler.current?.();
  }, [frameKey]);

  useEffect(() => {
    const media = matchMedia("(min-width: 1024px)");
    const update = () => setDevice(media.matches ? "desktop" : "mobile"); update();
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = gridContainer.current;
    if (!serving || !gridSized || !element) return;
    const update = () => {
      const width = element.getBoundingClientRect().width;
      if (Number.isFinite(width) && width > 0) setGridWidth(previous => previous === width ? previous : width);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(element);
    if (!observer) window.addEventListener("resize", update);
    return () => { observer?.disconnect(); if (!observer) window.removeEventListener("resize", update); };
  }, [serving, gridSized, frameKey]);
  useEffect(() => {
    frameFilled.current = false;
    framePending.current = false;
    window.clearTimeout(frameTimer.current);
    frameTimer.current = undefined;
    return () => { window.clearTimeout(frameTimer.current); frameTimer.current = undefined; };
  }, [frameKey, serving]);
  useEffect(() => {
    if (!serving || global) return;
    const message = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow
        || event.data?.type !== "lfh-ad-status" || event.data?.placement !== placement
        || (provider === "exoclick" && event.data.nonce !== nonce)) return;
      if (event.data.status === "filled" || (provider === "exoclick" && event.data.status === "loaded")) {
        frameFilled.current = true; window.clearTimeout(frameTimer.current);
      }
      if (provider === "trafficstars" && placement === "feed" && event.data.status === "pending") {
        framePending.current = true;
        window.clearTimeout(frameTimer.current);
        frameTimer.current = undefined;
      }
      if (event.data.status === "empty") empty();
    };
    window.addEventListener("message", message);
    return () => { window.removeEventListener("message", message); window.clearTimeout(frameTimer.current); };
  }, [serving, global, placement, provider, nonce, empty]);
  useEffect(() => {
    const element = frame.current;
    if (!serving || global || provider !== "exoclick" || !element) return;
    let visible = false, disposed = false;
    const post = (value: boolean) => element.contentWindow?.postMessage({type: "lfh-ad-visibility", placement, nonce, visible: value}, location.origin);
    const update = () => { if (!disposed) post(visible && !document.hidden && currentAds.current.canServe(placement)); };
    sendVisibility.current = target => { if (target === element) update(); };
    const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(entries => {
      if (disposed) return;
      const entry = entries.find(value => value.target === element);
      if (entry) { visible = entry.isIntersecting && entry.intersectionRatio >= .5; update(); }
    }, {threshold: [0, .5]});
    observer?.observe(element);
    const hide = () => post(false);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", update);
    update();
    return () => {
      disposed = true; post(false); sendVisibility.current = undefined; observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", update);
    };
  }, [serving, global, provider, placement, nonce, frameKey]);
  useEffect(() => {
    const element = container.current;
    if (!serving || !element || !global || !device || !provider) return;
    const permission = {
      permitted: () => currentAds.current.canServe(placement),
      onStart: () => currentAds.current.markSdkStarted(device),
    };
    if (provider === "exoclick") {
      if (!globalExoSpot) return;
      return mountExoclickGlobalAd({ placement, spot: globalExoSpot, container: element, ...permission });
    }
    if (!trafficSpot) return;
    return mountTrafficStarsAd({ placement, profile, spot: trafficSpot, container: element, ...permission });
  }, [serving, trafficSpot, globalExoSpot, provider, mediation, placement, global, device, profile, revision]);

  if (!serving || !provider) return null;
  if (global) return (provider === "exoclick" ? globalExoSpot : trafficSpot)
    ? <div ref={container} id={id} hidden data-ad-placement={placement} data-ad-provider={provider} /> : null;
  if (!spot) return null;
  const iframe = !gridSized || gridReady ? <iframe key={frameKey} ref={frame} id={id} title={adsCopy[locale].label} loading={loading ?? (placement === "header" ? "eager" : "lazy")}
      src={frameSrc}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer" className={gridSized ? "absolute left-0 top-0 block origin-top-left border-0" : "mx-auto max-w-full border-0"}
      onLoad={event => {
        if (event.currentTarget !== frame.current) return;
        sendVisibility.current?.(event.currentTarget);
        // Exo's XML/vendor documents own their bounded load timeout; a paused
        // or reduced-motion linear ad must not be discarded before a user plays it.
        if (provider !== "trafficstars" || placement !== "feed") return;
        window.clearTimeout(frameTimer.current);
        if (!frameFilled.current && !framePending.current) frameTimer.current = window.setTimeout(empty, 10_000);
      }}
      style={gridSized ? { width:spot.width, height:spot.height, transform:`scale(${gridScale})` }
        : placement === "feed" ? { width:"100%", height:"85dvh", maxHeight:"100%" } : { width:spot.width, height:spot.height }} /> : null;
  return <aside ref={gridSized ? gridContainer : undefined} aria-label={adsCopy[locale].label} data-ad-placement={placement} data-ad-provider={provider}
    className={`mx-auto ${gridSized ? "flex w-full min-w-0 flex-col" : "max-w-full overflow-hidden"}${footerWrapper ? " flex flex-col items-center justify-center" : ""} ${className}`}
    style={gridSized ? {aspectRatio:"0.6"} : footerWrapper ? {width:"100%",maxWidth:860,minHeight:250} : undefined}>
    <p className="mb-1 text-center text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">{adsCopy[locale].label}</p>
    {gridSized ? <div className="grid min-h-0 flex-1 place-items-center">
      <div data-ad-grid-frame className="relative mx-auto w-full" style={{maxWidth:spot.width,aspectRatio:`${spot.width} / ${spot.height}`,overflow:"clip"}}>{iframe}</div>
    </div> : iframe}
  </aside>;
}

export function AdsOverlays() {
  const ads = useAds();
  const path = usePathname();
  const feed = /^\/(?:feed|tiktok)(?:\/|$)/.test(stripLocalePrefix(path).pathname);
  if (!["popunder", "interstitial", "slider"].some(key => ads.canServe(key as AdPlacement))) return null;
  return <>
    <style>{`.ts-im-container{bottom:calc(5rem + env(safe-area-inset-bottom))!important;${feed ? "left:1rem!important;right:auto!important;" : "right:1rem!important;"}transform:none!important;max-width:calc(100vw - 2rem)!important;z-index:45!important}.ts-im-button-close{min-width:44px;min-height:44px}@media(min-width:1024px){.ts-im-container{bottom:1rem!important;right:1rem!important;left:auto!important}}`}</style>
    <AdSlot placement="popunder" /><AdSlot placement="interstitial" /><AdSlot placement="slider" />
  </>;
}

/** Ads shown only for non-premium users. Full-width friendly. */
function LegacyAdSlot({
  variant = "banner",
  hide = false,
}: {
  variant?: "banner" | "interstitial";
  hide?: boolean;
}) {
  const { isPremium, ready } = usePremium();
  const ads = useAds();
  const { locale } = useLocale();
  const copy = DISCOVERY_COPY[locale];
  const excluded = ads.runtime?.reason === "premium" || ads.runtime?.reason === "owner";
  if (hide || !ready || isPremium || excluded || (variant === "banner" && ads.canServe("header"))) return null;

  if (variant === "interstitial") {
    const monthlyPlan = getPlan("month");
    const number = new Intl.NumberFormat(locale);
    const premiumLabel = copy.premium
      .replace("{stars}", number.format(monthlyPlan.stars))
      .replace("{days}", number.format(monthlyPlan.days));
    return (
      <div
        className="flex w-full min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-center text-xs text-[var(--color-ink-faint)]"
        data-ad="interstitial"
      >
        <span>{copy.ad}</span>
        <Link href="/premium" className="font-semibold text-[var(--color-accent)] hover:underline">
          {premiumLabel}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink-faint)]"
      data-ad="header"
    >
      <span>{copy.ad}</span>
      <Link href="/premium" className="font-semibold text-[var(--color-accent)] hover:underline">
        {copy.removeAd}
      </Link>
    </div>
  );
}

export function AdSlot(props: NetworkSlotProps & { variant?: never; hide?: never } | { placement?: never; className?: never; onEmpty?: never; loading?: never; context?: never; ordinal?: never; layout?: never; variant?: "banner" | "interstitial"; hide?: boolean }) {
  return props.placement ? <NetworkAdSlot placement={props.placement} className={props.className} onEmpty={props.onEmpty} loading={props.loading} context={props.context} ordinal={props.ordinal} layout={props.layout} /> : <LegacyAdSlot variant={props.variant} hide={props.hide} />;
}
