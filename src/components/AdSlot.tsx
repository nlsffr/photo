"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { AdPlacement } from "@/lib/ads-contract";
import { ADS_REGISTRY, type AdDevice } from "@/lib/ads-registry";
import { mountTrafficStarsAd } from "@/lib/ads-sdk";
import { adsCopy } from "@/lib/ads-copy";
import { useAds } from "./AdsProvider";
import { useLocale } from "./LocaleProvider";
import { usePathname } from "next/navigation";
import { LocalizedLink as Link } from "./LocalizedLink";
import { usePremium } from "./Premium";
import { DISCOVERY_COPY } from "@/features/i18n/discovery-copy";
import { getPlan } from "@/lib/premium-plans";

function NetworkAdSlot({ placement, className = "", onEmpty }: { placement: AdPlacement; className?: string; onEmpty?: () => void }) {
  const ads = useAds();
  const { locale } = useLocale();
  const container = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const frameTimer = useRef<number | undefined>(undefined);
  const frameFilled = useRef(false);
  const currentAds = useRef(ads);
  useEffect(() => { currentAds.current = ads; }, [ads]);
  const emptyHandler = useRef(onEmpty);
  useEffect(() => { emptyHandler.current = onEmpty; }, [onEmpty]);
  const [device, setDevice] = useState<AdDevice | null>(null);
  const id = `lfh-ad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const eligible = ads.canServe(placement);
  const spot = device ? ADS_REGISTRY[placement][device] : null;
  const global = ["popunder", "interstitial", "slider"].includes(placement);

  useEffect(() => {
    const media = matchMedia("(min-width: 1024px)");
    const update = () => setDevice(media.matches ? "desktop" : "mobile"); update();
    media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!eligible || global) return;
    const message = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow
        || event.data?.type !== "lfh-ad-status" || event.data?.placement !== placement) return;
      if (event.data.status === "filled") { frameFilled.current = true; window.clearTimeout(frameTimer.current); }
      if (event.data.status === "empty") { window.clearTimeout(frameTimer.current); emptyHandler.current?.(); }
    };
    window.addEventListener("message", message);
    return () => { window.removeEventListener("message", message); window.clearTimeout(frameTimer.current); };
  }, [eligible, global, placement]);
  useEffect(() => {
    const element = container.current;
    if (!eligible || !element || !spot || !global) return;
    let remove: (() => void) | undefined;
    const mount = () => {
      if (remove) return;
      remove = mountTrafficStarsAd({ placement, spot, container:element,
        permitted:() => currentAds.current.canServe(placement), onStart:() => currentAds.current.markSdkStarted(device!) });
    };
    mount(); return () => remove?.();
  }, [eligible, spot, placement, global, device]);

  if (!eligible || !spot) return null;
  if (global) return <div ref={container} id={id} hidden data-ad-placement={placement} />;
  return <aside aria-label={adsCopy[locale].label} data-ad-placement={placement} className={`mx-auto max-w-full overflow-hidden ${className}`}>
    <p className="mb-1 text-center text-[10px] uppercase tracking-wide text-[var(--color-ink-faint)]">{adsCopy[locale].label}</p>
    <iframe ref={frame} id={id} title={adsCopy[locale].label} loading="lazy"
      src={`/api/ads/embed?placement=${placement}&device=${device}`}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer" className="mx-auto max-w-full border-0"
      onLoad={() => {
        if (placement !== "feed") return;
        window.clearTimeout(frameTimer.current);
        if (!frameFilled.current) frameTimer.current = window.setTimeout(() => emptyHandler.current?.(), 10_000);
      }}
      style={placement === "feed" ? { width:"100%", height:"85dvh", maxHeight:"100%" } : { width:spot.width, height:spot.height }} />
  </aside>;
}

export function AdsOverlays() {
  const ads = useAds();
  const path = usePathname();
  const feed = /(?:^|\/)(?:feed|tiktok)(?:\/|$)/.test(path);
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
  if (hide || !ready || isPremium || (variant === "banner" && ads.canServe("header"))) return null;

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

export function AdSlot(props: { placement: AdPlacement; className?: string; onEmpty?: () => void; variant?: never; hide?: never } | { placement?: never; className?: never; onEmpty?: never; variant?: "banner" | "interstitial"; hide?: boolean }) {
  return props.placement ? <NetworkAdSlot placement={props.placement} className={props.className} onEmpty={props.onEmpty} /> : <LegacyAdSlot variant={props.variant} hide={props.hide} />;
}
