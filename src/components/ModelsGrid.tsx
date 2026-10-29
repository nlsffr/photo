"use client";

import { useState } from "react";
import type { CreatorWithStats } from "@/lib/types";
import type { ModelsPagePayload, ModelsSort } from "@/lib/models-pagination";
import { appendUniqueCreators } from "@/lib/models-pagination";
import { CreatorCard } from "./CreatorCard";

type Props = {
  initialModels: CreatorWithStats[];
  initialHasMore: boolean;
  initialNextOffset: number | null;
  sort: ModelsSort;
};

export function ModelsGrid({
  initialModels,
  initialHasMore,
  initialNextOffset,
  sort,
}: Props) {
  const [models, setModels] = useState(initialModels);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const loadMore = async () => {
    if (loading || !hasMore || nextOffset === null) return;

    setLoading(true);
    setError(false);
    setAnnouncement("");

    try {
      const params = new URLSearchParams({
        sort,
        offset: String(nextOffset),
      });
      const response = await fetch(`/api/models?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const page = (await response.json()) as ModelsPagePayload<CreatorWithStats>;
      if (!Array.isArray(page.items) || typeof page.hasMore !== "boolean") {
        throw new Error("Invalid models response");
      }

      const before = models.length;
      const merged = appendUniqueCreators(models, page.items);
      setModels(merged);
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
      setAnnouncement(`${merged.length - before} créateurs ajoutés.`);
    } catch {
      setError(true);
      setAnnouncement("Impossible de charger plus de créateurs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        id="models-grid"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
        aria-busy={loading}
      >
        {models.map((creator) => (
          <CreatorCard key={creator.handle} creator={creator} />
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {error && (
        <p role="alert" className="mt-4 text-center text-sm text-[var(--color-ink-muted)]">
          Impossible de charger la suite. Réessaie dans un instant.
        </p>
      )}

      {hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            aria-controls="models-grid"
            className="rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Chargement…" : error ? "Réessayer" : "Voir plus"}
          </button>
        </div>
      )}
    </>
  );
}
