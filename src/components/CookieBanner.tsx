"use client";
import Link from "next/link";
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
  return <section aria-label={copy.manage} className="fixed inset-x-0 top-1/2 z-50 mx-auto max-w-lg -translate-y-1/2 px-3">
    <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl">
      <p className="text-sm text-[var(--color-ink-muted)]">{copy.body}{" "}
        <Link href={localizedHref(locale,"/confidentialite")} className="text-[var(--color-accent)] hover:underline">{t("shell.cookies.more")}</Link>
      </p>
      <button type="button" disabled={pending} onClick={() => choose("accepted")} className="mt-3 min-h-11 w-full rounded-full bg-[var(--color-accent)] px-4 text-sm font-bold text-white hover:bg-[var(--color-accent-600)]">{copy.accept}</button>
      <button type="button" disabled={pending} onClick={() => choose("refused")} className="mx-auto mt-1 flex min-h-11 items-center justify-center px-4 text-xs text-[var(--color-ink-muted)] underline underline-offset-4">{copy.refuse}</button>
      {error && <p role="alert" className="text-sm text-[var(--color-ink)]">{copy.error}</p>}
    </div>
  </section>;
}
