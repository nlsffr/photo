"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SearchBar } from "./SearchBar";
import { AccountMenu } from "./AccountMenu";
import { BrandLogo } from "./BrandLogo";
import { useLocale } from "./LocaleProvider";

function I(d: string) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function useNavSections() {
  const { t } = useLocale();
  return [
    {
      title: t("discover"),
      links: [
        { href: "/", labelKey: "home", icon: I("M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"), active: (p: string) => p === "/" },
        { href: "/models", labelKey: "models", icon: I("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"), active: (p: string) => p.startsWith("/models") },
        { href: "/feed", labelKey: "feed", icon: I("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 8l6 4-6 4z"), active: (p: string) => p.startsWith("/feed") || p.startsWith("/tiktok") },
        { href: "/trending-medias", labelKey: "trending", icon: I("M13 2L3 14h9l-1 8 10-12h-9l1-8z"), active: (p: string) => p.startsWith("/trending") },
        { href: "/most-liked", labelKey: "mostLiked", icon: I("M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"), active: (p: string) => p.startsWith("/most-liked") },
        { href: "/random/medias", labelKey: "random", icon: I("M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6"), active: (p: string) => p.startsWith("/random") },
        { href: "/pour-toi", labelKey: "forYou", icon: I("M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"), active: (p: string) => p.startsWith("/pour-toi") },
      ],
    },
    {
      title: t("account") || "Compte",
      links: [
        { href: "/favoris", labelKey: "saved", icon: I("M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4z"), active: (p: string) => p.startsWith("/favoris") },
        { href: "/premium", labelKey: "premium", icon: I("M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"), active: (p: string) => p.startsWith("/premium") },
        { href: "/connexion", labelKey: "login", icon: I("M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"), active: (p: string) => p.startsWith("/connexion") || p.startsWith("/inscription") },
      ],
    },
  ];
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const sections = useNavSections();
  const { t } = useLocale();
  return (
    <nav className="flex flex-col gap-4">
      {sections.map((sec) => (
        <div key={sec.title}>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink-faint)]">
            {sec.title}
          </p>
          <ul className="space-y-0.5">
            {sec.links.map((l) => {
              const active = l.active(pathname);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    prefetch={true}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                      active
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                        : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {l.icon}
                    {t(l.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const TABS: { href: string; labelKey: string; d: string; active: (p: string) => boolean }[] = [
  { href: "/", labelKey: "home", d: "M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10", active: (p) => p === "/" },
  { href: "/models", labelKey: "models", d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", active: (p) => p.startsWith("/models") },
  { href: "/feed", labelKey: "feed", d: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 8l6 4-6 4z", active: (p) => p.startsWith("/feed") },
  { href: "/recherche", labelKey: "search", d: "M11 11a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3", active: (p) => p.startsWith("/recherche") },
  { href: "/connexion", labelKey: "login", d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3", active: (p) => p.startsWith("/connexion") || p.startsWith("/inscription") },
];

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
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium leading-none ${
              active ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]"
            }`}
          >
            <span className="grid h-6 w-6 place-items-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={tab.d} />
              </svg>
            </span>
            <span className="max-w-full truncate px-0.5 text-center">{t(tab.labelKey)}</span>
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
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Link>
          <AccountMenu />
        </div>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-[var(--color-bg)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-3">
              <BrandLogo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-ink-muted)]"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <SideNav onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-[var(--color-border)] p-3 lg:block">
          <SideNav />
        </aside>
        <main className={`min-w-0 flex-1 ${isFeed ? "pb-0" : "pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-6"}`}>
          {children}
        </main>
      </div>

      {!isFeed && <BottomTabs />}

      {!isFeed && (
        <footer className="mt-auto hidden border-t border-[var(--color-border)] py-8 lg:block">
          <div className="mx-auto max-w-7xl px-4 text-center">
            <p className="text-sm text-[var(--color-ink-muted)]">© 2026 LeakFanHub. 18+ only.</p>
            <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-[var(--color-ink-muted)]">
              <Link href="/conditions" className="hover:text-[var(--color-ink)]">
                Conditions
              </Link>
              <Link href="/confidentialite" className="hover:text-[var(--color-ink)]">
                Confidentialité
              </Link>
              <Link href="/trust-and-safety" className="hover:text-[var(--color-ink)]">
                Trust & Safety
              </Link>
              <Link href="/dmca" className="hover:text-[var(--color-ink)]">
                DMCA
              </Link>
              <Link href="/contact" className="hover:text-[var(--color-ink)]">
                Contact
              </Link>
            </nav>
          </div>
        </footer>
      )}
    </div>
  );
}
