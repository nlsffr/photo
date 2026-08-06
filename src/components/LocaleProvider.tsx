"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  LOCALES,
  detectLocale,
  type Locale,
  t as translate,
} from "@/lib/i18n/messages";

const COOKIE = "lfh_locale";

const FLAGS: Record<Locale, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  it: "🇮🇹",
  es: "🇪🇸",
  de: "🇩🇪",
  pt: "🇵🇹",
  nl: "🇳🇱",
  pl: "🇵🇱",
};

const NAMES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  it: "Italiano",
  es: "Español",
  de: "Deutsch",
  pt: "Português",
  nl: "Nederlands",
  pl: "Polski",
};

interface LocaleCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
  locales: Locale[];
}

const Ctx = createContext<LocaleCtx | null>(null);

function readCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  const v = m?.[1] as Locale | undefined;
  return v && LOCALES.includes(v) ? v : null;
}

function writeCookie(l: Locale) {
  document.cookie = `${COOKIE}=${l};path=/;max-age=31536000;samesite=lax`;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const fromCookie = readCookie();
    if (fromCookie) setLocaleState(fromCookie);
    else {
      const detected = detectLocale(navigator.language || navigator.languages?.[0]);
      setLocaleState(detected);
      writeCookie(detected);
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    writeCookie(l);
    try {
      document.documentElement.lang = l;
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback((key: string) => translate(locale, key), [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, t, locales: LOCALES }),
    [locale, setLocale, t],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      locale: "en",
      setLocale: () => {},
      t: (k) => translate("en", k),
      locales: LOCALES,
    };
  }
  return ctx;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, locales } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
        aria-label="Language"
      >
        <span className="text-base leading-none">{FLAGS[locale]}</span>
        <span className="hidden text-xs font-semibold uppercase text-[var(--color-ink-muted)] sm:inline">
          {locale}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <ul className="absolute right-0 z-50 mt-1 max-h-64 w-44 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-xl">
            {locales.map((l) => (
              <li key={l}>
                <button
                  type="button"
                  onClick={() => {
                    setLocale(l);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)] ${
                    l === locale ? "text-[var(--color-accent)]" : ""
                  }`}
                >
                  <span>{FLAGS[l]}</span>
                  <span>{NAMES[l]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
