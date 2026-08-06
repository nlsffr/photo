"use client";

import Link from "next/link";
import { usePremium } from "@/components/Premium";

const PERKS = [
  {
    title: "Sans publicité",
    body: "Plus aucune bannière ni interstitiel. Lecture pure.",
  },
  {
    title: "Qualité prioritaire",
    body: "Chargement accéléré des médias et accès anticipé aux nouveautés.",
  },
  {
    title: "Feed avancé",
    body: "Filtres supplémentaires et « Pour toi » plus précis.",
  },
  {
    title: "Soutien créateurs",
    body: "Une part de l’abonnement aide les modèles que tu suis.",
  },
];

export default function PremiumPage() {
  const { isPremium, startCheckout, setPremium } = usePremium();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-400">
          Premium
        </span>
        <h1 className="mt-4 text-4xl font-black tracking-tight">
          LeakFanHub Premium
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-[var(--color-ink-muted)]">
          $4.99 / mois — sans pub, plus rapide, plus perso.
        </p>
      </div>

      {isPremium ? (
        <div className="mt-8 rounded-2xl border border-amber-500/40 bg-amber-400/10 p-6 text-center">
          <p className="text-lg font-bold text-amber-300">Tu es Premium ✨</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Merci — les pubs sont désactivées sur ton compte.
          </p>
          <button
            type="button"
            onClick={() => setPremium(false)}
            className="mt-4 text-xs text-[var(--color-ink-faint)] underline"
          >
            (dev) désactiver Premium
          </button>
        </div>
      ) : (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => startCheckout()}
            className="rounded-full bg-amber-400 px-8 py-3 text-sm font-black text-black hover:bg-amber-300"
          >
            S’abonner — $4.99/mois
          </button>
          <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
            Paiement sécurisé Stripe. Annulable à tout moment.
          </p>
        </div>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PERKS.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <h2 className="font-bold">{p.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <Link href="/" className="text-sm text-[var(--color-ink-muted)] hover:underline">
          Continuer gratuitement
        </Link>
      </div>
    </div>
  );
}
