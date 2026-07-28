"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhotoCard } from "./PhotoCard";
import type { MediaType, PhotoPage, PhotoView, SortKey } from "@/lib/types";

interface Props {
  initial: PhotoPage;
  params: {
    sort: SortKey;
    tag?: string;
    q?: string;
    creator?: string;
    type?: MediaType;
    /** "0" | "1" string for URL parity */
    ai?: string;
  };
}

export function InfiniteGallery({ initial, params }: Props) {
  const [items, setItems] = useState<PhotoView[]>(initial.items);
  const [cursor, setCursor] = useState<number | null>(initial.nextCursor);
  const [errored, setErrored] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  // Every id we've already shown — the ultimate guard against duplicate pages
  // (e.g. random sort, or new media inserted between two fetches).
  const seenRef = useRef<Set<string>>(new Set(initial.items.map((i) => i.id)));
  // Seed for random sort: keep the first page's shuffle stable across pages.
  const seedRef = useRef<number | undefined>(initial.seed);

  const buildUrl = useCallback(
    (c: number) => {
      const sp = new URLSearchParams();
      sp.set("sort", params.sort);
      if (params.tag) sp.set("tag", params.tag);
      if (params.q) sp.set("q", params.q);
      if (params.creator) sp.set("creator", params.creator);
      if (params.type) sp.set("type", params.type);
      if (params.ai === "0" || params.ai === "1") sp.set("ai", params.ai);
      if (seedRef.current !== undefined) sp.set("seed", String(seedRef.current));
      sp.set("cursor", String(c));
      return `/api/photos?${sp.toString()}`;
    },
    [params.sort, params.tag, params.q, params.creator, params.type, params.ai],
  );

  const loadMore = useCallback(async () => {
    if (loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    try {
      const res = await fetch(buildUrl(cursor));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page: PhotoPage = await res.json();
      if (page.seed !== undefined) seedRef.current = page.seed;

      // Keep only media we haven't shown yet — kills infinite duplicate loops.
      const fresh = page.items.filter((p) => !seenRef.current.has(p.id));
      for (const p of fresh) seenRef.current.add(p.id);
      if (fresh.length > 0) {
        setItems((prev) => [...prev, ...fresh]);
      }

      // Stop when the server says there's no more, OR when a full page came
      // back with nothing new (defensive: prevents a stuck sentinel).
      if (page.nextCursor === null || page.nextCursor === cursor) {
        setCursor(null);
      } else {
        setCursor(page.nextCursor);
      }
      setErrored(false);
    } catch {
      // Stop auto-retrying; show a manual "retry" button instead of hammering.
      setErrored(true);
    } finally {
      loadingRef.current = false;
    }
  }, [buildUrl, cursor]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || cursor === null || errored) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "800px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, cursor, errored]);

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
      <div className="columns-2 gap-2.5 sm:columns-3 sm:gap-3 lg:columns-4 xl:columns-5">
        {items.map((p) => (
          <div key={p.id} className="mb-2.5 break-inside-avoid sm:mb-3">
            <PhotoCard photo={p} />
          </div>
        ))}
      </div>

      {cursor !== null && !errored && (
        <div ref={sentinelRef} className="flex justify-center py-10">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-surface-3)] border-t-[var(--color-accent)]"
            aria-label="Chargement"
            role="status"
          />
        </div>
      )}

      {cursor !== null && errored && (
        <div className="flex flex-col items-center gap-3 py-10">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Impossible de charger la suite.
          </p>
          <button
            type="button"
            onClick={() => {
              setErrored(false);
              loadMore();
            }}
            className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
          >
            Réessayer
          </button>
        </div>
      )}

      {cursor === null && (
        <p className="py-10 text-center text-sm text-[var(--color-ink-faint)]">
          Tu as tout vu — {items.length} médias.
        </p>
      )}
    </>
  );
}
