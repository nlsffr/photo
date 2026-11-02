"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  LOCALES,
  LOCALE_COOKIE,
  localePath,
  type Locale,
} from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const FLAGS: Record<Locale, string> = { en: "🇬🇧", fr: "🇫🇷", es: "🇪🇸", de: "🇩🇪", it: "🇮🇹", pt: "🇵🇹", nl: "🇳🇱" };
const NAMES: Record<Locale, string> = { en: "English", fr: "Français", es: "Español", de: "Deutsch", it: "Italiano", pt: "Português", nl: "Nederlands" };

interface LocaleCtx {
  locale: Locale;
  basePath: string;
  dictionary: Dictionary;
  t: (key: string) => string;
}

const Ctx = createContext<LocaleCtx | null>(null);

function translate(dictionary: Dictionary, key: string): string {
  let value: unknown = dictionary;
  for (const segment of key.split(".")) {
    if (!value || typeof value !== "object") return key;
    value = (value as Record<string, unknown>)[segment];
  }
  return typeof value === "string" ? value : key;
}

export function writeLocaleCookie(locale: Locale) {
  const secure = window.location.protocol === "https:" ? ";secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax${secure}`;
}

export function LocaleProvider({
  children,
  locale,
  dictionary,
}: {
  children: React.ReactNode;
  locale: Locale;
  dictionary: Dictionary;
}) {
  const value = useMemo<LocaleCtx>(
    () => ({
      locale,
      basePath: localePath(locale, "/"),
      dictionary,
      t: (key) => translate(dictionary, key),
    }),
    [dictionary, locale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}

export function LanguageSwitcher({
  className = "",
  placement = "down",
}: {
  className?: string;
  placement?: "up" | "down";
}) {
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-9 min-w-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
        aria-label={t("shell.language")}
        aria-expanded={open}
      >
        <span className="text-base leading-none" aria-hidden="true">
          {FLAGS[locale]}
        </span>
        <span className="hidden text-xs font-semibold uppercase text-[var(--color-ink-muted)] sm:inline">
          {locale}
        </span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label={t("shell.closeMenu")}
            onClick={() => setOpen(false)}
          />
          <ul
            className={`absolute z-50 max-h-64 w-44 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl ${
              placement === "up"
                ? "bottom-full left-0 mb-1"
                : "right-0 top-full mt-1"
            }`}
          >
            {LOCALES.map((nextLocale) => (
                <li key={nextLocale}>
                  <button
                    type="button"
                    lang={nextLocale}
                    aria-pressed={nextLocale === locale}
                    onClick={() => {
                      writeLocaleCookie(nextLocale);
                      setOpen(false);
                      // Reload the document even when the current URL has a
                      // fragment; a same-URL link could only scroll instead.
                      window.location.reload();
                    }}
                    className={`flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)] ${
                      nextLocale === locale ? "text-[var(--color-accent)]" : ""
                    }`}
                  >
                    <span aria-hidden="true">{FLAGS[nextLocale]}</span>
                    <span>{NAMES[nextLocale]}</span>
                  </button>
                </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
