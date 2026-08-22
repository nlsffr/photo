"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PhotoView } from "@/lib/types";
import { creatorHref } from "@/lib/types";
import { PhotoCard } from "./PhotoCard";
import { MediaImg } from "./MediaImg";
import { useSession } from "./Session";

type CreatorRow = {
  handle: string;
  name: string;
  avatarUrl: string;
  verified: boolean;
  followers: number;
  photoCount: number;
};

export function FollowingFeed() {
  const { user, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<PhotoView[] | null>(null);
  const [creators, setCreators] = useState<CreatorRow[] | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setItems([]);
      setCreators([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch("/api/library?kind=following", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/library?kind=creators", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([posts, cres]) => {
        if (cancelled) return;
        setItems(Array.isArray(posts.items) ? posts.items : []);
        setCreators(Array.isArray(cres.creators) ? cres.creators : []);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setCreators([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading]);

  if (sessionLoading || items === null || creators === null) {
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
          Tes abonnements sont liés à ton compte.
        </p>
        <Link
          href="/connexion?next=/abonnements"
          className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Connexion
        </Link>
      </div>
    );
  }

  if (creators.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-lg font-semibold">Tu ne suis personne… encore</p>
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          Cette page affiche uniquement les créatrices/créateurs que tu suis
          (bouton Suivre sur un profil). Être créatrice soi-même n’ajoute pas
          automatiquement ton contenu ici.
        </p>
        <Link
          href="/models"
          className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Découvrir des modèles
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex gap-3 overflow-x-auto pb-1">
        {creators.map((c) => (
          <Link
            key={c.handle}
            href={creatorHref(c.handle)}
            className="flex w-20 shrink-0 flex-col items-center gap-1.5"
          >
            <MediaImg
              src={c.avatarUrl}
              alt={c.name}
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover object-top ring-2 ring-[var(--color-border)]"
            />
            <span className="w-full truncate text-center text-[11px] font-medium">
              {c.name || c.handle}
            </span>
          </Link>
        ))}
      </div>

      <p className="mb-3 text-sm text-[var(--color-ink-muted)]">
        {creators.length} modèle{creators.length > 1 ? "s" : ""} suivi
        {creators.length > 1 ? "s" : ""} · {items.length} publication
        {items.length > 1 ? "s" : ""}
      </p>

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--color-ink-muted)]">
          Tu suis {creators.length} profil
          {creators.length > 1 ? "s" : ""}, mais aucune publication récente en
          base pour eux.
        </p>
      ) : (
        <div className="media-grid">
          {items.map((p) => (
            <div key={p.id} className="min-w-0">
              <PhotoCard photo={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
