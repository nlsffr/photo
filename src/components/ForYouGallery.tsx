"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { PhotoView } from "@/lib/types";
import { personalizeFeed } from "@/lib/personalize";
import { PhotoCard } from "./PhotoCard";
import { useInteractions } from "./Interactions";

export function ForYouGallery({
  items,
  limit = 60,
}: {
  items: PhotoView[];
  limit?: number;
}) {
  const { likedIds, savedIds, followedHandles, ready } = useInteractions();

  const { list, hasTaste, signals } = useMemo(() => {
    const liked = new Set(likedIds);
    const saved = new Set(savedIds);
    const followed = new Set(followedHandles);
    const { list, hasTaste } = personalizeFeed(items, liked, saved, followed);

    // Top taste signals for the subtitle.
    const engaged = new Set([...likedIds, ...savedIds]);
    const tagCount = new Map<string, number>();
    for (const p of items) {
      if (!engaged.has(p.id)) continue;
      for (const t of p.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
    const topTags = [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => `#${t}`);
    const followedNames = items
      .filter((p) => followed.has(p.creatorHandle))
      .map((p) => p.creator.name);
    const signals = [...new Set([...topTags, ...followedNames])].slice(0, 4);

    return { list: list.slice(0, limit), hasTaste, signals };
  }, [items, likedIds, savedIds, followedHandles, limit]);

  if (!ready) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] skeleton rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      {!hasTaste ? (
        <div className="mb-5 rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-accent-soft)] to-transparent p-5">
          <p className="text-lg font-bold">Ton feed, rien qu’à toi ✨</p>
          <p className="mt-1 max-w-lg text-sm text-[var(--color-ink-muted)]">
            Aime des photos ❤️ et suis des modèles 👤 : « Pour toi »
            apprend tes goûts et te propose du contenu de plus en plus pertinent.
            En attendant, voici les tendances.
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
          >
            Explorer et aimer
          </Link>
        </div>
      ) : (
        signals.length > 0 && (
          <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
            D’après tes goûts :{" "}
            <span className="font-medium text-[var(--color-ink)]">
              {signals.join(" · ")}
            </span>
          </p>
        )
      )}

      <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
        {list.map(({ photo, reason }) => (
          <div key={photo.id} className="mb-3 break-inside-avoid">
            <PhotoCard photo={photo} />
            <p className="mt-1 h-4 truncate text-xs text-[var(--color-accent)]">
              {hasTaste ? (reason ?? "") : ""}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
