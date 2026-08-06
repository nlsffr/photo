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

const SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", labelKey: "home", icon: I("M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"), active: (p) => p === "/" },
      { href: "/recherche", labelKey: "search", icon: I("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3"), active: (p) => p.startsWith("/recherche") },
      { href: "/models", labelKey: "discover", icon: I("M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM16.2 7.8l-2.9 6.4-6.4 2.9 2.9-6.4z"), active: (p) => p.startsWith("/models") },
      { href: "/feed", labelKey: "feed", icon: I("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 8l6 4-6 4z"), active: (p) => p.startsWith("/feed") || p.startsWith("/tiktok") },
      { href: "/trending-medias", labelKey: "trending", icon: I("M5 17l6-6 4 4 8-8M21 7v6h-6"), active: (p) => p.startsWith("/trending-medias") },
      { href: "/most-liked", labelKey: "mostLiked", icon: I("M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z"), active: (p) => p.startsWith("/most-liked") },
      { href: "/random/medias", labelKey: "random", icon: I("M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"), active: (p) => p.startsWith("/random") },
      { href: "/pour-toi", labelKey: "forYou", icon: I("M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z"), active: (p) => p.startsWith("/pour-toi") },
      { href: "/abonnements", labelKey: "following", icon: I("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4"), active: (p) => p.startsWith("/abonnements") },
      { href: "/favoris", labelKey: "saved", icon: I("M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4Z"), active: (p) => p.startsWith("/favoris") },
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
    items: [
      { href: "/models", labelKey: "models", icon: I("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"), active: (p) => p === "/models" },
      { href: "/classements", labelKey: "rankings", icon: I("M8 21V9M16 21V5M4 21v-6M20 21v-10"), active: (p) => p.startsWith("/classements") },
    ],
  },
  {
    titleKey: "help",
    items: [
      { href: "/contact", labelKey: "contact", icon: I("M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6"), active: (p) => p.startsWith("/contact") },
      { href: "/dmca", labelKey: "dmca", icon: I("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"), active: (p) => p.startsWith("/dmca") },
      { href: "/trust-and-safety", labelKey: "trust", icon: I("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"), active: (p) => p.startsWith("/trust-and-safety") },
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
                    ? "text-[var(--color-ink)]"
                    : "text-[var(--color-ink-muted)]";
            return (
              <Link
                key={item.href + item.labelKey}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] ${color} ${
                  isActive ? "bg-[var(--color-surface-2)]" : ""
                }`}
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

const TABS: { href: string; labelKey: string; d: string; active: (p: string) => boolean }[] = [
  { href: "/", labelKey: "home", d: "M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10", active: (p) => p === "/" },
  { href: "/models", labelKey: "models", d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", active: (p) => p.startsWith("/models") },
  { href: "/feed", labelKey: "feed", d: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 8l6 4-6 4z", active: (p) => p.startsWith("/feed") },
  { href: "/recherche", labelKey: "search", d: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3", active: (p) => p.startsWith("/recherche") },
  { href: "/connexion", labelKey: "login", d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3", active: (p) => p.startsWith("/connexion") || p.startsWith("/inscription") },
];

function BottomTabs() {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(3.75rem+env(safe-area-inset-bottom))] items-stretch border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {TABS.map((tab) => {
        const active = tab.active(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              active ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]"
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={tab.d} />
            </svg>
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col">
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

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
          <LanguageSwitcher className="hidden sm:block" />
          <Link
            href="/recherche"
            aria-label="Search"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] sm:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Link>
          <AccountMenu />
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] lg:block">
          <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] overflow-y-auto p-3">
            <NavContent />
            <div className="mt-4 px-2">
              <LanguageSwitcher className="w-full" />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto overscroll-contain border-r border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <BrandLogo />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <NavContent onNavigate={() => setOpen(false)} />
            <div className="mt-4 px-2">
              <LanguageSwitcher className="w-full" />
            </div>
          </div>
        </div>
      )}

      <BottomTabs />

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <BrandLogo />
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--color-ink-faint)]">
              <Link href="/conditions" className="hover:text-[var(--color-ink-muted)]">
                Conditions
              </Link>
              <Link href="/confidentialite" className="hover:text-[var(--color-ink-muted)]">
                Privacy
              </Link>
              <Link href="/trust-and-safety" className="hover:text-[var(--color-ink-muted)]">
                Trust & Safety
              </Link>
              <Link href="/dmca" className="hover:text-[var(--color-ink-muted)]">
                DMCA
              </Link>
              <Link href="/contact" className="hover:text-[var(--color-ink-muted)]">
                Contact
              </Link>
            </div>
          </div>
          <p className="mt-4 text-xs text-[var(--color-ink-faint)]">
            © 2026 LeakFanHub. 18+ only.
          </p>
        </div>
      </footer>
    </div>
  );
}
