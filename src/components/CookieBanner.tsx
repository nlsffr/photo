"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "lfh:cookies:v1";

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const accept = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg px-3 lg:bottom-4">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl">
        <p className="text-sm text-[var(--color-ink-muted)]">
          Nous utilisons un stockage local minimal (préférences, likes). Pas de
          trackers publicitaires tiers.{" "}
          <Link href="/confidentialite" className="text-[var(--color-accent)] hover:underline">
            En savoir plus
          </Link>
        </p>
        <button
          type="button"
          onClick={accept}
          className="mt-3 w-full rounded-full bg-[var(--color-accent)] py-2 text-sm font-bold text-white"
        >
          OK
        </button>
      </div>
    </div>
  );
}
