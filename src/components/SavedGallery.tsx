"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PhotoView } from "@/lib/types";
import { PhotoCard } from "./PhotoCard";
import { useSession } from "./Session";

export function SavedGallery({ kind = "saved" }: { kind?: "saved" | "liked" }) {
  const { user, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<PhotoView[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoadError(false);
    fetch(`/api/library?kind=${kind}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setItems(Array.isArray(d.items) ? d.items : []);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading, kind]);

  const visible = useMemo(
    () =>
      (items || []).filter(
        (p) => p && p.id && (p.imageUrl || p.videoUrl),
      ),
    [items],
  );

  if (sessionLoading || items === null) {
    return (
      <div className="media-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] skeleton rounded-xl" />
        ))}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-lg font-semibold">Connecte-toi</p>
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          Tes enregistrements sont liés à ton compte.
        </p>
        <Link
          href={`/connexion?next=/favoris`}
          className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Connexion
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-lg font-semibold">Chargement impossible</p>
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          Réessaie dans un instant.
        </p>
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-lg font-semibold">
          {kind === "liked" ? "Aucun like" : "Rien d’enregistré"}
        </p>
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          {kind === "liked"
            ? "Like des médias pour les retrouver ici."
            : "Touche le signet sur une photo ou une vidéo."}
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
    <div>
      <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
        {visible.length} {kind === "liked" ? "like" : "enregistrement"}
        {visible.length > 1 ? "s" : ""}
      </p>
      <div className="media-grid">
        {visible.map((p) => (
          <div key={p.id} className="min-w-0">
            <PhotoCard photo={p} />
          </div>
        ))}
      </div>
    </div>
  );
}
