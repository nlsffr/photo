"use client";

import Link from "next/link";
import type { PhotoView } from "@/lib/types";
import { PhotoCard } from "./PhotoCard";
import { useInteractions } from "./Interactions";

export function FollowingFeed({ items }: { items: PhotoView[] }) {
  const { followedHandles, ready } = useInteractions();

  if (!ready) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
        ))}
      </div>
    );
  }

  const set = new Set(followedHandles);
  const posts = items
    .filter((p) => set.has(p.creatorHandle))
    .sort((a, b) => a.ageMinutes - b.ageMinutes);

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink-faint)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" />
          </svg>
        </div>
        <p className="text-lg font-semibold">Tu ne suis personne… encore</p>
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          Suis des modèles pour voir leurs dernières publications ici.
        </p>
        <Link
          href="/models"
          className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
        >
          Découvrir des modèles
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
        {posts.length} publication{posts.length > 1 ? "s" : ""} de{" "}
        {followedHandles.length} modèle{followedHandles.length > 1 ? "s" : ""} suivi
        {followedHandles.length > 1 ? "s" : ""}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {posts.map((p) => (
          <PhotoCard key={p.id} photo={p} />
        ))}
      </div>
    </>
  );
}
