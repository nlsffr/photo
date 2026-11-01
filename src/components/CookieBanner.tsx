"use client";
import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { useEffect, useState } from "react";
import { localizedHref } from "@/lib/i18n/config";
import { AUDIENCE_COOKIE, CHOICE_MAX_AGE, cookieCopy, type Choice } from "@/lib/audience-choice";
import { CHOICE_CHANGED, OPEN_CHOICES, useAudienceChoice } from "./AudienceChoice";
import { useLocale } from "./LocaleProvider";

export function CookieBanner() {
  const { locale, t } = useLocale();
  const choice = useAudienceChoice();
  const [opened, setOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const copy = cookieCopy[locale];
  useEffect(() => {
    const open = () => { setOpened(true); setError(false); };
    window.addEventListener(OPEN_CHOICES, open);
    return () => window.removeEventListener(OPEN_CHOICES, open);
  }, []);
  if (!opened && (choice !== null || dismissed)) return null;

  async function choose(value: Choice) {
    setPending(true); setError(false);
    if (value === "refused") {
      document.cookie = AUDIENCE_COOKIE + "=refused; Path=/; SameSite=Lax; Max-Age=" + CHOICE_MAX_AGE + (location.protocol === "https:" ? "; Secure" : "");
      window.dispatchEvent(new Event(CHOICE_CHANGED));
    }
    try {
      const result = await fetch("/api/cookies/choice", { method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"}, body:JSON.stringify({choice:value}) });
      if (!result.ok) throw new Error();
      try { localStorage.setItem("lfh:choice-update", String(Date.now())); } catch { /* storage may be disabled */ }
      window.dispatchEvent(new Event(CHOICE_CHANGED));
      setOpened(false); setDismissed(true);
    } catch { if (value === "refused") { setOpened(false); setDismissed(true); } else { setError(true); } } finally { setPending(false); }
  }
  return <section aria-label={copy.manage} className="fixed inset-x-0 top-[calc(50%+1.5rem)] z-50 mx-auto max-w-[27rem] -translate-y-1/2 px-4 font-sans">
    <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 pb-2 pt-6 text-center shadow-[0_24px_80px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-4 flex justify-center">
        <BrandLogo href={localizedHref(locale, "/")} size="sm" />
      </div>
      <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">{copy.body}{" "}
        <Link href={localizedHref(locale,"/confidentialite")} className="whitespace-nowrap text-[var(--color-accent)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]">{t("shell.cookies.more")}</Link>
      </p>
      <button type="button" disabled={pending} onClick={() => choose("accepted")} className="mt-5 min-h-12 w-full rounded-full bg-[var(--color-accent)] px-5 text-[15px] font-bold tracking-tight text-white transition-colors hover:bg-[var(--color-accent-600)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)] disabled:cursor-wait">{copy.accept}</button>
      <button type="button" disabled={pending} onClick={() => choose("refused")} className="mx-auto mt-1 flex min-h-11 items-center justify-center rounded-full px-4 text-[0.6875rem] text-[var(--color-ink-muted)] underline underline-offset-4 hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-wait">{copy.refuse}</button>
      {error && <p role="alert" className="text-sm text-[var(--color-ink)]">{copy.error}</p>}
    </div>
  </section>;
}
