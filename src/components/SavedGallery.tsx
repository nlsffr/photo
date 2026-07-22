"use client";

import Link from "next/link";
import type { PhotoView } from "@/lib/types";
import { PhotoCard } from "./PhotoCard";
import { useInteractions } from "./Interactions";

export function SavedGallery({ items }: { items: PhotoView[] }) {
  const { savedIds, ready } = useInteractions();

  if (!ready) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/5] animate-pulse rounded-xl bg-[var(--color-surface-2)]"
          />
        ))}
      </div>
    );
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const saved = savedIds
    .map((id) => byId.get(id))
    .filter((p): p is PhotoView => Boolean(p));

  if (saved.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink-faint)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4Z" />
          </svg>
        </div>
        <p className="text-lg font-semibold">Rien d’enregistré</p>
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          Touche l’icône <span className="font-semibold">signet</span> sur une
          photo ou une vidéo pour la retrouver ici.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
        >
          Explorer
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
        {saved.length} enregistrement{saved.length > 1 ? "s" : ""}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {saved.map((p) => (
          <PhotoCard key={p.id} photo={p} />
        ))}
      </div>
    </>
  );
}
