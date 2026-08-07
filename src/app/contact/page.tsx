import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Contact" };

const CHANNELS = [
  {
    href: "/contact/support",
    title: "Support & aide",
    body: "Un bug, une question sur ton compte, un souci d’affichage ? L’équipe support répond ici.",
    icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  },
  {
    href: "/contact/signalement",
    title: "Signaler un contenu",
    body: "Signale un contenu inapproprié, une usurpation d’identité ou une atteinte à la vie privée.",
    icon: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  },
  {
    href: "/contact/partenariats",
    title: "Partenariats & créateurs",
    body: "Tu es modèle ou créateur et veux publier sur LeakFanHub ? Parlons-en.",
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  },
  {
    href: "/contact/presse",
    title: "Presse & médias",
    body: "Demandes presse, interviews, ressources de marque et informations sur le projet.",
    icon: "M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2M18 14h-8M15 18h-5M10 6h8v4h-8V6z",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Contact</h1>
      <p className="mt-3 text-lg text-[var(--color-ink-muted)]">
        Choisis le bon canal ci-dessous — on te répondra plus vite. Pour une
        demande de retrait de contenu, utilise la page dédiée{" "}
        <Link href="/dmca" className="text-[var(--color-accent)] hover:underline">
          DMCA
        </Link>
        .
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CHANNELS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-accent)]"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={c.icon} />
              </svg>
            </span>
            <div>
              <h2 className="font-bold group-hover:text-[var(--color-ink)]">
                {c.title}
              </h2>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {c.body}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-ink-muted)]">
        <h2 className="font-bold text-[var(--color-ink)]">Adresse e-mail générale</h2>
        <p className="mt-1.5">
          Pour toute demande qui n’entre dans aucune catégorie :{" "}
          <a
            href="mailto:contact@leakfanhub.com"
            className="font-mono text-[var(--color-ink)] hover:text-[var(--color-accent)]"
          >
            contact@leakfanhub.com
          </a>
        </p>
      </div>
    </div>
  );
}
