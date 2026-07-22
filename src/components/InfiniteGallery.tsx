"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhotoCard } from "./PhotoCard";
import type { PhotoPage, PhotoView, SortKey } from "@/lib/types";

interface Props {
  initial: PhotoPage;
  params: { sort: SortKey; tag?: string; q?: string; creator?: string };
}

export function InfiniteGallery({ initial, params }: Props) {
  const [items, setItems] = useState<PhotoView[]>(initial.items);
  const [cursor, setCursor] = useState<number | null>(initial.nextCursor);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const buildUrl = useCallback(
    (c: number) => {
      const sp = new URLSearchParams();
      sp.set("sort", params.sort);
      if (params.tag) sp.set("tag", params.tag);
      if (params.q) sp.set("q", params.q);
      if (params.creator) sp.set("creator", params.creator);
      sp.set("cursor", String(c));
      return `/api/photos?${sp.toString()}`;
    },
    [params.sort, params.tag, params.q, params.creator],
  );

  const loadMore = useCallback(async () => {
    if (loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    try {
      const res = await fetch(buildUrl(cursor));
      const page: PhotoPage = await res.json();
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      // Leave the sentinel in place so scrolling can retry.
    } finally {
      loadingRef.current = false;
    }
  }, [buildUrl, cursor]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || cursor === null) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, cursor]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink-faint)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
        <p className="text-lg font-semibold">Aucun résultat</p>
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          Essaie un autre mot-clé ou retire les filtres pour voir plus de photos.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((p) => (
          <PhotoCard key={p.id} photo={p} />
        ))}
      </div>

      {cursor !== null && (
        <div ref={sentinelRef} className="flex justify-center py-10">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-surface-3)] border-t-[var(--color-accent)]"
            aria-label="Chargement"
            role="status"
          />
        </div>
      )}

      {cursor === null && (
        <p className="py-10 text-center text-sm text-[var(--color-ink-faint)]">
          Tu as tout vu — {items.length} photos.
        </p>
      )}
    </>
  );
}
