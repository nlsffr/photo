"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "./Session";

export function AccountMenu() {
  const { user, loading, logout } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // While we don't yet know: neutral avatar placeholder (avoids a flash).
  if (loading) {
    return (
      <div className="h-9 w-9 rounded-full bg-[var(--color-surface-2)]" aria-hidden />
    );
  }

  // Logged out — the original sign-up CTA + login icon.
  if (!user) {
    return (
      <>
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
      </>
    );
  }

  // Logged in — avatar initial + dropdown.
  const label = user.username || user.email;
  const initial = (user.username || user.email).charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Mon compte"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-accent)] text-sm font-black text-white"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <p className="truncate text-sm font-semibold">{label}</p>
            {user.username && (
              <p className="truncate text-xs text-[var(--color-ink-faint)]">
                {user.email}
              </p>
            )}
          </div>
          <nav className="flex flex-col py-1 text-sm">
            <Link
              href="/favoris"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              Mes enregistrements
            </Link>
            <Link
              href="/abonnements"
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              Mes abonnements
            </Link>
            <button
              type="button"
              onClick={async () => {
                setOpen(false);
                await logout();
                router.push("/");
                router.refresh();
              }}
              className="px-4 py-2 text-left text-red-400 hover:bg-[var(--color-surface-2)]"
            >
              Se déconnecter
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
