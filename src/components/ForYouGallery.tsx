"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PhotoView } from "@/lib/types";
import { personalizeFeed } from "@/lib/personalize";
import { PhotoCard } from "./PhotoCard";
import { useInteractions } from "./Interactions";
import { useSession } from "./Session";

export function ForYouGallery({
  items: seedItems,
  limit = 80,
}: {
  items: PhotoView[];
  limit?: number;
}) {
  const { user } = useSession();
  const { likedIds, savedIds, followedHandles, ready } = useInteractions();
  const [extra, setExtra] = useState<PhotoView[]>([]);

  // Pull more from followed creators when logged in
  useEffect(() => {
    if (!user || !ready || followedHandles.length === 0) {
      setExtra([]);
      return;
    }
    let cancelled = false;
    fetch("/api/library?kind=following", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d.items)) setExtra(d.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, ready, followedHandles.length]);

  const mergedSeed = useMemo(() => {
    const seen = new Set<string>();
    const out: PhotoView[] = [];
    for (const p of [...extra, ...seedItems]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [seedItems, extra]);

  const { list, hasTaste, signals } = useMemo(() => {
    const liked = new Set(likedIds);
    const saved = new Set(savedIds);
    const followed = new Set(followedHandles);
    const { list, hasTaste } = personalizeFeed(mergedSeed, liked, saved, followed);

    const engaged = new Set([...likedIds, ...savedIds]);
    const tagCount = new Map<string, number>();
    for (const p of mergedSeed) {
      if (!engaged.has(p.id)) continue;
      for (const t of p.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
    const topTags = [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => `#${t}`);
    const followedNames = mergedSeed
      .filter((p) => followed.has(p.creatorHandle))
      .map((p) => p.creator.name);
    const signals = [...new Set([...topTags, ...followedNames])].slice(0, 4);

    return { list: list.slice(0, limit), hasTaste, signals };
  }, [mergedSeed, likedIds, savedIds, followedHandles, limit]);

  if (!ready) {
    return (
      <div className="media-grid">
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
          <p className="text-lg font-bold">Ton feed, rien qu’à toi</p>
          <p className="mt-1 max-w-lg text-sm text-[var(--color-ink-muted)]">
            Like, enregistre et suis des modèles : « Pour toi » s’adapte à tes goûts.
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white"
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

      {list.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--color-ink-muted)]">
          Pas encore de médias — like ou suis des modèles.
        </p>
      ) : (
        <div className="media-grid">
          {list.map(({ photo }) => (
            <div key={photo.id} className="min-w-0">
              <PhotoCard photo={photo} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
