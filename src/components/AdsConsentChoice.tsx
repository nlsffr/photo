"use client";
import { useState } from "react";
import { adsCopy } from "@/lib/ads-copy";
import { useLocale } from "./LocaleProvider";
import { useAds } from "./AdsProvider";

export function AdsConsentChoice({ onSaved }: { onSaved?: () => void }) {
  const ads = useAds();
  const { locale } = useLocale();
  const copy = adsCopy[locale];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  if (!ads.consentAvailable) return null;
  async function choose(choice: "accepted" | "refused") {
    if (pending) return;
    setPending(true); setError(false);
    const saved = await ads.choose(choice);
    setPending(false); setError(!saved);
    if (saved) onSaved?.();
  }
  return <div className="mt-4 border-t border-[var(--color-border)] pt-4 text-left">
    <h2 className="text-sm font-semibold">{copy.title}</h2>
    <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-muted)]">{copy.body}</p>
    <div className="mt-3 grid gap-2">
      <button type="button" disabled={pending} onClick={() => void choose("accepted")} aria-pressed={ads.consent === "accepted"}
        className="min-h-11 rounded-full bg-[var(--color-accent)] px-3 text-sm font-semibold text-white disabled:opacity-60">{copy.accept}</button>
      <button type="button" disabled={pending} onClick={() => void choose("refused")} aria-pressed={ads.consent === "refused"}
        className="min-h-11 rounded-full border border-[var(--color-border)] px-3 text-sm font-semibold disabled:opacity-60">{copy.refuse}</button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs">{copy.error}</p>}
  </div>;
}
