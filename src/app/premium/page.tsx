import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Premium" };

const PERKS = [
  {
    title: "Sans limite",
    body: "Navigation fluide, pas de temporisation, chargement prioritaire des médias en haute qualité.",
    icon: "M13 2 3 14h7l-1 8 10-12h-7l1-8z",
  },
  {
    title: "Feed avancé",
    body: "Des filtres supplémentaires, un « Pour toi » plus fin, et l’accès anticipé aux nouveautés.",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    title: "Soutiens les créateurs",
    body: "Une part de l’abonnement revient aux modèles que tu suis et que tu aimes le plus.",
    icon: "M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z",
  },
  {
    title: "Confidentialité renforcée",
    body: "Aucune publicité, jamais — comme le reste du site, mais avec l’expérience la plus complète.",
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  },
];

export default function PremiumPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 7l4 5 5-7 5 7 4-5v11H3z" />
          </svg>
          Premium
        </span>
        <h1 className="mt-4 text-4xl font-black tracking-tight">
          Passe à la vitesse supérieure
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-[var(--color-ink-muted)]">
          Une expérience LumenGallery sans compromis — plus rapide, plus
          personnalisée, et qui soutient directement les créateurs.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PERKS.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-400/15 text-amber-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={p.icon} />
              </svg>
            </span>
            <h2 className="mt-3 font-bold">{p.title}</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-accent-soft)] to-transparent p-6 text-center">
        <p className="text-lg font-bold">Bientôt disponible</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-ink-muted)]">
          Premium n’est pas encore lancé. Crée un compte pour être prévenu·e dès
          son ouverture — sans engagement.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/inscription"
            className="rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-bold text-white hover:bg-[var(--color-accent-600)]"
          >
            Créer un compte
          </Link>
          <Link
            href="/"
            className="rounded-full border border-[var(--color-border)] px-6 py-2.5 text-sm font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
          >
            Continuer gratuitement
          </Link>
        </div>
      </div>
    </div>
  );
}
