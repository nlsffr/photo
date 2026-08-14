"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SearchBar } from "./SearchBar";
import { AccountMenu } from "./AccountMenu";
import { BrandLogo } from "./BrandLogo";
import { LanguageSwitcher, useLocale } from "./LocaleProvider";

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
  accent?: "gold" | "pink";
  active?: (pathname: string) => boolean;
};

type NavSection = { titleKey?: string; items: NavItem[] };

const I = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

/** Menu complet — comme avant (découvrir + compte + aide légale) */
const SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", labelKey: "home", icon: I("M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"), active: (p) => p === "/" },
      { href: "/recherche", labelKey: "search", icon: I("M21 21l-4.35-4.35M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0"), active: (p) => p.startsWith("/recherche") },
      { href: "/models", labelKey: "models", icon: I("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"), active: (p) => p.startsWith("/models") },
      { href: "/feed", labelKey: "feed", icon: I("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 8l6 4-6 4z"), active: (p) => p.startsWith("/feed") || p.startsWith("/tiktok") },
      { href: "/trending-medias", labelKey: "trending", icon: I("M5 17l6-6 4 4 8-8M21 7v6h-6"), active: (p) => p.startsWith("/trending-medias") },
      { href: "/most-liked", labelKey: "mostLiked", icon: I("M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z"), active: (p) => p.startsWith("/most-liked") },
      { href: "/random/medias", labelKey: "random", icon: I("M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"), active: (p) => p.startsWith("/random") },
      { href: "/pour-toi", labelKey: "forYou", icon: I("M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z"), active: (p) => p.startsWith("/pour-toi") },
      { href: "/abonnements", labelKey: "following", icon: I("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4"), active: (p) => p.startsWith("/abonnements") },
      { href: "/favoris", labelKey: "saved", icon: I("M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4z"), active: (p) => p.startsWith("/favoris") },
      { href: "/add", labelKey: "add", icon: I("M12 5v14M5 12h14"), active: (p) => p.startsWith("/add") },
      { href: "/classements", labelKey: "rankings", icon: I("M8 21V9M16 21V5M4 21v-6M20 21v-10"), active: (p) => p.startsWith("/classements") },
    ],
  },
  {
    items: [
      { href: "/premium", labelKey: "premium", icon: I("M3 7l4 5 5-7 5 7 4-5v11H3z"), accent: "gold", active: (p) => p.startsWith("/premium") },
      { href: "/connexion", labelKey: "login", icon: I("M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"), active: (p) => p.startsWith("/connexion") },
      { href: "/inscription", labelKey: "signup", icon: I("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6"), accent: "pink", active: (p) => p.startsWith("/inscription") },
    ],
  },
  {
    titleKey: "help",
    items: [
      { href: "/contact", labelKey: "contact", icon: I("M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6"), active: (p) => p === "/contact" || p.startsWith("/contact?") },
      { href: "/dmca", labelKey: "dmca", icon: I("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"), active: (p) => p.startsWith("/dmca") },
      { href: "/trust-and-safety", labelKey: "trust", icon: I("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"), active: (p) => p.startsWith("/trust-and-safety") },
      { href: "/contact/signalement", labelKey: "report", icon: I("M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"), active: (p) => p.startsWith("/contact/signalement") },
      { href: "/conditions", labelKey: "terms", icon: I("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"), active: (p) => p.startsWith("/conditions") },
      { href: "/confidentialite", labelKey: "privacy", icon: I("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"), active: (p) => p.startsWith("/confidentialite") },
    ],
  },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <nav className="flex flex-col gap-4">
      {SECTIONS.map((section, si) => (
        <div key={si} className="flex flex-col gap-0.5">
          {section.titleKey && (
            <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-faint)]">
              {t(section.titleKey)}
            </p>
          )}
          {section.items.map((item) => {
            const isActive = item.active?.(pathname) ?? false;
            const color =
              item.accent === "gold"
                ? "text-amber-400"
                : item.accent === "pink"
                  ? "text-[var(--color-accent)]"
                  : isActive
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-ink-muted)]";
            const bg = isActive
              ? "bg-[var(--color-accent)]/15"
              : "hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]";
            return (
              <Link
                key={item.href + item.labelKey}
                href={item.href}
                prefetch={true}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors ${color} ${bg}`}
              >
                <span className="shrink-0">{item.icon}</span>
                {t(item.labelKey)}
              </Link>
            );
          })}
          {si < SECTIONS.length - 1 && (
            <div className="mx-3 mt-2 border-t border-[var(--color-border)]" />
          )}
        </div>
      ))}
    </nav>
  );
}

const TABS: { href: string; labelKey: string; icon: "home" | "models" | "feed" | "search" | "login"; active: (p: string) => boolean }[] = [
  { href: "/", labelKey: "home", icon: "home", active: (p) => p === "/" },
  { href: "/models", labelKey: "models", icon: "models", active: (p) => p.startsWith("/models") },
  { href: "/feed", labelKey: "feed", icon: "feed", active: (p) => p.startsWith("/feed") },
  { href: "/recherche", labelKey: "search", icon: "search", active: (p) => p.startsWith("/recherche") },
  { href: "/connexion", labelKey: "login", icon: "login", active: (p) => p.startsWith("/connexion") || p.startsWith("/inscription") },
];

function TabIcon({ name }: { name: (typeof TABS)[number]["icon"] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }
  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 9.5V20h4.5v-5.5h2V20H17.5V9.5" />
      </svg>
    );
  }
  if (name === "models") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19.5v-1.2A4.3 4.3 0 0 1 7.8 14h2.4a4.3 4.3 0 0 1 4.3 4.3v1.2" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M20.5 19.5v-.8a3.2 3.2 0 0 0-2.6-3.1" />
      </svg>
    );
  }
  if (name === "feed") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M10 9.5v5l5-2.5-5-2.5z" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M10 16l4-4-4-4" />
      <path d="M14 12H4" />
    </svg>
  );
}

function BottomTabs() {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex h-[calc(3.75rem+env(safe-area-inset-bottom))] items-stretch border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {TABS.map((tab) => {
        const active = tab.active(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={true}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium leading-none ${
              active ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]"
            }`}
          >
            <span className="grid h-[22px] w-[22px] place-items-center">
              <TabIcon name={tab.icon} />
            </span>
            <span className="w-full truncate text-center">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isFeed = pathname.startsWith("/feed") || pathname.startsWith("/tiktok");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex min-h-14 items-center gap-2 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] lg:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        <BrandLogo />

        <div className="ml-auto hidden min-w-0 max-w-xs flex-1 sm:block md:max-w-sm">
          <Suspense fallback={<div className="h-9 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]" />}>
            <SearchBar />
          </Suspense>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0 sm:gap-1.5">
          <Link
            href="/premium"
            className="hidden rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-400/25 sm:inline"
          >
            Premium
          </Link>
          <Link
            href="/add"
            aria-label="Add"
            className="hidden h-9 w-9 place-items-center rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-600)] sm:grid"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          <Link
            href="/recherche"
            aria-label="Search"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] sm:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <LanguageSwitcher className="sm:hidden" />
          <LanguageSwitcher className="hidden sm:block" />
          <AccountMenu />
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] lg:block">
          <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] flex max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] flex-col p-3">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavContent />
            </div>
            <div className="mt-3 shrink-0 border-t border-[var(--color-border)] pt-3">
              <LanguageSwitcher className="w-full" placement="up" />
            </div>
          </div>
        </aside>

        <main className={`min-w-0 flex-1 ${isFeed ? "pb-0" : "pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-8"}`}>
          {children}
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col bg-[var(--color-bg)] shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] p-3 pb-2">
              <BrandLogo />
              <button onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
              <NavContent onNavigate={() => setOpen(false)} />
              <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-faint)]">Langue</p>
                <LanguageSwitcher className="w-full" placement="up" />
              </div>
            </div>
          </div>
        </div>
      )}

      {!isFeed && <BottomTabs />}

      {!isFeed && (
        <footer className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="mx-auto flex max-w-[1600px] flex-col items-center gap-5 px-4 py-8 text-center sm:px-6">
            <BrandLogo size="md" />
            <p className="max-w-xl text-xs text-[var(--color-ink-muted)]">
              18+ only. Tolérance zéro : tout contenu impliquant des mineurs est interdit et doit être signalé immédiatement.
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-[var(--color-ink-muted)]">
              <Link href="/conditions" className="hover:text-[var(--color-ink)]">Conditions</Link>
              <Link href="/confidentialite" className="hover:text-[var(--color-ink)]">Confidentialité</Link>
              <Link href="/trust-and-safety" className="hover:text-[var(--color-ink)]">Trust & Safety</Link>
              <Link href="/dmca" className="hover:text-[var(--color-ink)]">DMCA</Link>
              <Link href="/contact" className="hover:text-[var(--color-ink)]">Contact</Link>
              <Link href="/contact/signalement" className="font-semibold text-[var(--color-accent)] hover:underline">Signaler</Link>
            </nav>
            <p className="text-xs text-[var(--color-ink-faint)]">© 2026 LeakFanHub · 18+ only</p>
          </div>
        </footer>
      )}
    </div>
  );
}
