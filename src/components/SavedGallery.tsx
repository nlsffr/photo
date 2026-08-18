"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PhotoView } from "@/lib/types";
import { PhotoCard } from "./PhotoCard";
import { useSession } from "./Session";

export function SavedGallery({ kind = "saved" }: { kind?: "saved" | "liked" }) {
  const { user, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<PhotoView[] | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/library?kind=${kind}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setItems(d.items || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading, kind]);

  if (sessionLoading || items === null) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] skeleton rounded-xl" />
        ))}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-lg font-semibold">Connecte-toi</p>
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          Tes enregistrements sont liés à ton compte.
        </p>
        <Link
          href={`/connexion?next=/${kind === "liked" ? "pour-toi" : "favoris"}`}
          className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Connexion
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink-faint)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4Z" />
          </svg>
        </div>
        <p className="text-lg font-semibold">
          {kind === "liked" ? "Aucun like" : "Rien d’enregistré"}
        </p>
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          {kind === "liked"
            ? "Like des médias pour les retrouver ici."
            : "Touche le signet sur une photo ou une vidéo pour la retrouver ici."}
        </p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Explorer
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
        {items.length} {kind === "liked" ? "like" : "enregistrement"}
        {items.length > 1 ? "s" : ""}
      </p>
      <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
        {items.map((p) => (
          <div key={p.id} className="mb-3 break-inside-avoid">
            <PhotoCard photo={p} />
          </div>
        ))}
      </div>
    </>
  );
}
