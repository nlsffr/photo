"use client";

import Link from "next/link";
import { usePremium } from "./Premium";

/** Ads shown only for non-premium users. Full-width friendly. */
export function AdSlot({
  variant = "banner",
  hide = false,
}: {
  variant?: "banner" | "interstitial";
  hide?: boolean;
}) {
  const { isPremium, ready } = usePremium();
  if (hide || !ready || isPremium) return null;

  if (variant === "interstitial") {
    return (
      <div
        className="flex w-full min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-center text-xs text-[var(--color-ink-faint)]"
        data-ad="interstitial"
      >
        <span>Publicité</span>
        <Link href="/premium" className="font-semibold text-[var(--color-accent)] hover:underline">
          Premium sans pub — $4.99/mois
        </Link>
      </div>
    );
  }

  return (
    <div
      className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink-faint)]"
      data-ad="header"
    >
      <span>Publicité</span>
      <Link href="/premium" className="font-semibold text-[var(--color-accent)] hover:underline">
        Retirer avec Premium
      </Link>
    </div>
  );
}
