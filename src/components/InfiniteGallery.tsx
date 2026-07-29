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
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set(initial.items.map((i) => i.id)));
  const seedRef = useRef<number | undefined>(initial.seed);
  const cursorRef = useRef<number | null>(initial.nextCursor);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

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
    const c = cursorRef.current;
    if (loadingRef.current || c === null) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(buildUrl(c), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page: PhotoPage = await res.json();
      if (page.seed !== undefined) seedRef.current = page.seed;

      const fresh = page.items.filter((p) => !seenRef.current.has(p.id));
      for (const p of fresh) seenRef.current.add(p.id);
      if (fresh.length > 0) {
        setItems((prev) => [...prev, ...fresh]);
      }

      if (page.nextCursor === null || page.nextCursor === c) {
        setCursor(null);
        cursorRef.current = null;
      } else {
        setCursor(page.nextCursor);
        cursorRef.current = page.nextCursor;
      }
      setErrored(false);
    } catch {
      setErrored(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || cursor === null) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !errored) {
          void loadMore();
        }
      },
      { root: null, rootMargin: "1200px 0px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, cursor, errored, items.length]);

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

      {cursor !== null && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-3 py-10">
          {loading && (
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-surface-3)] border-t-[var(--color-accent)]"
              aria-label="Chargement"
              role="status"
            />
          )}
          {errored && (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Impossible de charger la suite.
            </p>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setErrored(false);
              void loadMore();
            }}
            className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)] disabled:opacity-60"
          >
            {loading ? "Chargement…" : errored ? "Réessayer" : "Charger plus"}
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
