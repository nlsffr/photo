"use client";

import { useEffect, useState } from "react";

const KEY = "lumen_age_ok";

export function AgeGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  function accept() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  function leave() {
    window.location.href = "https://www.google.com";
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-2xl">
        <p className="text-3xl font-black">18+</p>
        <h2 className="mt-2 text-xl font-bold">Contenu réservé aux adultes</h2>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Ce site contient du contenu pour adultes. En entrant, tu confirmes avoir
          au moins 18 ans (ou l’âge de la majorité dans ton pays).
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={accept}
            className="flex-1 rounded-full bg-[var(--color-accent)] px-4 py-3 text-sm font-bold text-white"
          >
            J’ai 18 ans ou plus — Entrer
          </button>
          <button
            type="button"
            onClick={leave}
            className="flex-1 rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold"
          >
            Quitter
          </button>
        </div>
      </div>
    </div>
  );
}
