"use client";
import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { useEffect, useRef, useState } from "react";
import { localizedHref } from "@/lib/i18n/config";
import { AUDIENCE_COOKIE, CHOICE_MAX_AGE, cookieCopy, type Choice } from "@/lib/audience-choice";
import { CHOICE_CHANGED, OPEN_CHOICES, useAudienceChoice } from "./AudienceChoice";
import { useLocale } from "./LocaleProvider";

export function CookieBanner() {
  const { locale, t } = useLocale();
  const choice = useAudienceChoice();
  const [opened, setOpened] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const declineButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const saving = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const copy = cookieCopy[locale];
  useEffect(() => {
    const open = () => {
      if (saving.current) return;
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpened(true); setShowChoices(true); setError(false);
    };
    window.addEventListener(OPEN_CHOICES, open);
    return () => window.removeEventListener(OPEN_CHOICES, open);
  }, []);
  useEffect(() => {
    if (showChoices) declineButton.current?.focus({ preventScroll: true });
  }, [showChoices, opened]);
  if (!opened && (choice !== null || dismissed)) return null;

  function close() {
    setOpened(false); setDismissed(true);
    returnFocus.current?.focus({ preventScroll: true });
  }

  async function choose(value: Choice) {
    if (saving.current) return;
    saving.current = true;
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
      close();
    } catch { if (value === "refused") { close(); } else { setError(true); } } finally { saving.current = false; setPending(false); }
  }
  return <section aria-label={copy.manage} className="fixed inset-x-0 top-[calc(50%+1.5rem)] z-50 mx-auto max-w-[27rem] -translate-y-1/2 px-4 font-sans">
    <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 pb-2 pt-6 text-center shadow-[0_24px_80px_-20px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-4 flex justify-center">
        <BrandLogo href={localizedHref(locale, "/")} size="sm" />
      </div>
      <div className="grid">
        {[false, true].map((settings) => (
          <p key={String(settings)} aria-hidden={settings !== showChoices} className={`col-start-1 row-start-1 text-sm leading-relaxed text-[var(--color-ink-muted)] ${settings !== showChoices ? "invisible" : ""}`}>
            {settings ? copy.settingsBody : copy.body}{" "}
            <Link href={localizedHref(locale, "/confidentialite")} className="whitespace-nowrap text-[var(--color-accent)] underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]">{t("shell.cookies.more")}</Link>
          </p>
        ))}
      </div>
      <div className="mt-5">
        {showChoices ? (
          <div className="grid grid-cols-2 gap-3">
            <button ref={declineButton} type="button" disabled={pending} onClick={() => choose("refused")} className="min-h-12 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-wait">{copy.refuse}</button>
            <button type="button" disabled={pending} onClick={() => choose("accepted")} className="min-h-12 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-wait">{copy.confirm}</button>
          </div>
        ) : (
          <button type="button" disabled={pending} onClick={() => choose("accepted")} className="min-h-12 w-full rounded-full bg-[var(--color-accent)] px-5 text-[15px] font-bold tracking-tight text-white transition-colors hover:bg-[var(--color-accent-600)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-ink)] disabled:cursor-wait">{copy.accept}</button>
        )}
        <button ref={detailsButton} type="button" disabled={pending} aria-expanded={showChoices} onClick={() => {
          if (showChoices && choice !== null) { close(); return; }
          setShowChoices(!showChoices);
          setError(false);
          if (showChoices) requestAnimationFrame(() => detailsButton.current?.focus({ preventScroll: true }));
        }} className="mx-auto mt-1 flex min-h-11 items-center justify-center rounded-full px-4 text-[0.625rem] text-[var(--color-ink-muted)] underline underline-offset-4 hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-wait">
          {showChoices ? copy.back : copy.manage}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-[var(--color-ink)]">{copy.error}</p>}
    </div>
  </section>;
}
