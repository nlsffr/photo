import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Qu’est-ce que LeakFanHub ?" };

const STEPS = [
  {
    n: "01",
    title: "Explore le flux",
    body: "Un mur infini de photos, vidéos et packs, trié par tendances, par vues ou par nouveauté. Aucun compte requis pour regarder.",
  },
  {
    n: "02",
    title: "Suis tes modèles",
    body: "Chaque modèle a un profil avec sa galerie et ses statistiques. Suis-les pour retrouver leurs dernières publications dans ton feed.",
  },
  {
    n: "03",
    title: "Aime et enregistre",
    body: "Un cœur pour aimer, un signet pour enregistrer. Tes goûts alimentent l’onglet « Pour toi » qui devient de plus en plus pertinent.",
  },
  {
    n: "04",
    title: "Reste anonyme",
    body: "Aucun cookie publicitaire forcé, aucun tracker tiers, aucune conservation d’IP marketing. Tu peux naviguer avec une identité anonyme.",
  },
];

const FAQ = [
  {
    q: "Ai-je besoin d’un compte ?",
    a: "Non. Tu peux explorer toute la galerie sans compte. Un compte sert seulement à retrouver tes likes, tes enregistrements et tes modèles suivis sur plusieurs appareils.",
  },
  {
    q: "C’est gratuit ?",
    a: "Oui, l’accès à la galerie est gratuit. Premium ($4.99/mois) offrira des options avancées sans pubs.",
  },
  {
    q: "D’où vient le contenu ?",
    a: "Le contenu est agrégé / publié dans le cadre de la plateforme. Un signalement DMCA est disponible pour tout retrait légitime.",
  },
  {
    q: "Mes données sont-elles suivies ?",
    a: "LeakFanHub est conçu « privacy by default ». Voir la page Confidentialité.",
  },
];

export default function WhatIsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-accent)]">
        Bienvenue
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
        Qu’est-ce que Leak
        <span className="text-[var(--color-accent)]">FanHub</span> ?
      </h1>
      <p className="mt-3 text-lg text-[var(--color-ink-muted)]">
        LeakFanHub est une galerie communautaire de photos et de vidéos, pensée
        pour la découverte : dense, rapide, en défilement infini — et respectueuse
        de ta vie privée. 18+ uniquement.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="flex gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <span className="text-2xl font-black tabular-nums text-[var(--color-accent)]">
              {s.n}
            </span>
            <div>
              <h2 className="font-bold">{s.title}</h2>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {s.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-2xl font-bold tracking-tight">Questions fréquentes</h2>
      <div className="mt-4 flex flex-col gap-3">
        {FAQ.map((f) => (
          <details
            key={f.q}
            className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <summary className="cursor-pointer list-none font-semibold marker:content-none">
              <span className="flex items-center justify-between gap-3">
                {f.q}
                <span className="text-[var(--color-ink-faint)] transition-transform group-open:rotate-45">
                  +
                </span>
              </span>
            </summary>
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
        >
          Explorer la galerie
        </Link>
        <Link
          href="/contact"
          className="inline-flex rounded-full border border-[var(--color-border)] px-6 py-2.5 text-sm font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          Nous contacter
        </Link>
      </div>
    </div>
  );
}
