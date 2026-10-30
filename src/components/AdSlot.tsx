"use client";

import { LocalizedLink as Link } from "./LocalizedLink";
import { useLocale } from "./LocaleProvider";
import { usePremium } from "./Premium";
import { DISCOVERY_COPY } from "@/features/i18n/discovery-copy";

/** Ads shown only for non-premium users. Full-width friendly. */
export function AdSlot({
  variant = "banner",
  hide = false,
}: {
  variant?: "banner" | "interstitial";
  hide?: boolean;
}) {
  const { isPremium, ready } = usePremium();
  const { locale } = useLocale();
  const copy = DISCOVERY_COPY[locale];
  if (hide || !ready || isPremium) return null;

  if (variant === "interstitial") {
    return (
      <div
        className="flex w-full min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-center text-xs text-[var(--color-ink-faint)]"
        data-ad="interstitial"
      >
        <span>{copy.ad}</span>
        <Link href="/premium" className="font-semibold text-[var(--color-accent)] hover:underline">
          {copy.premium}
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
