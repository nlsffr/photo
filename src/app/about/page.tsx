import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "À propos" };

const FEATURES = [
  {
    title: "Une galerie communautaire",
    body: "Des photographes partagent leurs portraits, séries mode et travaux éditoriaux dans un flux unique et infini.",
  },
  {
    title: "Découverte",
    body: "Tri par récents, tendances, plus aimés ou aléatoire, filtres par tags et recherche instantanée.",
  },
  {
    title: "Profils de modèles",
    body: "Chaque photographe dispose d’une page profil avec sa galerie, ses statistiques et ses abonnés.",
  },
  {
    title: "Classements",
    body: "Un classement met en avant les créateurs les plus vus et appréciés de la communauté.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">
        À propos de Lumen<span className="text-[var(--color-accent)]">Gallery</span>
      </h1>
      <p className="mt-3 text-lg text-[var(--color-ink-muted)]">
        Une galerie de photographie moderne, pensée pour la découverte : dense,
        rapide, en défilement infini.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <h2 className="font-bold">{f.title}</h2>
            <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
              {f.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="font-bold">Contenu de démonstration</h2>
        <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
          Cette instance est une démo d’interface. Toutes les images, noms et
          statistiques sont des placeholders générés (images via picsum.photos,
          avatars via i.pravatar.cc). Aucun contenu réel n’est hébergé — la
          couche de données est destinée à être remplacée par votre propre
          contenu, dont vous détenez les droits.
        </p>
      </div>

      <div className="mt-8">
        <Link
          href="/"
          className="inline-flex rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
        >
          Explorer la galerie
        </Link>
      </div>
    </div>
  );
}
