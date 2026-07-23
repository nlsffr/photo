"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SearchBar } from "./SearchBar";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  accent?: "gold" | "pink";
  active?: (pathname: string) => boolean;
};

type NavSection = { title?: string; items: NavItem[] };

const I = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Accueil", icon: I("M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"), active: (p) => p === "/" },
      { href: "/models", label: "Modèles", icon: I("M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"), active: (p) => p.startsWith("/models") },
      { href: "/feed", label: "Feed", icon: I("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 8l6 4-6 4z"), active: (p) => p.startsWith("/feed") },
      { href: "/recherche", label: "Recherche", icon: I("M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3"), active: (p) => p.startsWith("/recherche") },
      { href: "/abonnements", label: "Abonnements", icon: I("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4"), active: (p) => p.startsWith("/abonnements") },
      { href: "/favoris", label: "Enregistrés", icon: I("M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4Z"), active: (p) => p.startsWith("/favoris") },
    ],
  },
  {
    title: "Compte",
    items: [
      { href: "/connexion", label: "Connexion", icon: I("M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"), active: (p) => p.startsWith("/connexion") },
      { href: "/inscription", label: "Inscription", icon: I("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6"), accent: "pink", active: (p) => p.startsWith("/inscription") },
      { href: "/identite", label: "Identité anonyme", icon: I("M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5zM4 21a8 8 0 0 1 16 0"), active: (p) => p.startsWith("/identite") },
    ],
  },
  {
    title: "Découvrir",
    items: [
      { href: "/classements", label: "Classements", icon: I("M8 21V9M16 21V5M4 21v-6M20 21v-10"), active: (p) => p.startsWith("/classements") },
      { href: "/about", label: "À propos", icon: I("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01"), active: (p) => p.startsWith("/about") },
    ],
  },
];

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4">
      {SECTIONS.map((section, si) => (
        <div key={si} className="flex flex-col gap-0.5">
          {section.title && (
            <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-faint)]">
              {section.title}
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
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] ${color} ${
                  isActive ? "bg-[var(--color-surface-2)]" : ""
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                {item.label}
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

const TABS: { href: string; label: string; d: string; active: (p: string) => boolean }[] = [
  { href: "/", label: "Accueil", d: "M3 11l9-8 9 8M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10", active: (p) => p === "/" },
  { href: "/models", label: "Modèles", d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", active: (p) => p.startsWith("/models") },
  { href: "/feed", label: "Feed", d: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM10 8l6 4-6 4z", active: (p) => p.startsWith("/feed") },
  { href: "/recherche", label: "Recherche", d: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3", active: (p) => p.startsWith("/recherche") },
  { href: "/connexion", label: "Connexion", d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3", active: (p) => p.startsWith("/connexion") || p.startsWith("/inscription") },
];

function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {TABS.map((t) => {
        const active = t.active(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
              active ? "text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]"
            }`}
          >
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={t.d} />
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Lock background scroll while the mobile drawer is open.
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
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex min-h-14 items-center gap-2 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] lg:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>

        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--color-accent)] text-lg font-black text-white">
            L
          </span>
          <span className="text-lg font-black tracking-tight">
            Lumen<span className="text-[var(--color-accent)]">gallery</span>
          </span>
        </Link>

        <div className="ml-auto hidden min-w-0 max-w-xs flex-1 sm:block md:max-w-sm">
          <Suspense fallback={<div className="h-9 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]" />}>
            <SearchBar />
          </Suspense>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
          <Link
            href="/recherche"
            aria-label="Recherche"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] sm:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </Link>
          <Link
            href="/inscription"
            className="hidden items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 py-2 text-sm font-bold text-white hover:bg-[var(--color-accent-600)] sm:inline-flex"
          >
            S’inscrire
          </Link>
          <Link
            href="/connexion"
            aria-label="Connexion"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </Link>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop left rail */}
        <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] lg:block">
          <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] overflow-y-auto p-3">
            <NavContent />
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto overscroll-contain border-r border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-black tracking-tight">
                Lumen<span className="text-[var(--color-accent)]">gallery</span>
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <NavContent onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <BottomTabs />

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-base font-black tracking-tight">
              Lumen<span className="text-[var(--color-accent)]">gallery</span>
            </span>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--color-ink-faint)]">
              {["Conditions", "Confidentialité", "Mentions légales", "DMCA", "Contact"].map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </div>
          <p className="mt-4 text-xs text-[var(--color-ink-faint)]">
            © 2026 Lumengallery. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
}
