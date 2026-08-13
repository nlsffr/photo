import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trust & Safety",
  description:
    "Politique de modération LeakFanHub — tolérance zéro pour le contenu illégal et tout contenu impliquant des mineurs.",
};

export default function TrustAndSafetyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Trust & Safety</h1>
      <p className="mt-4 text-lg text-[var(--color-ink-muted)]">
        LeakFanHub applique une <strong className="text-[var(--color-ink)]">tolérance zéro</strong> pour
        le contenu illégal. Les utilisateurs peuvent signaler tout contenu suspect.
      </p>

      <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
        <h2 className="text-lg font-bold text-red-400">Contenu mineur — strictement interdit</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Tout contenu (photo, vidéo, description) impliquant une personne de moins de 18 ans
          est <strong className="text-[var(--color-ink)]">totalement interdit</strong> et illégal.
          Si tu en vois un, <strong className="text-[var(--color-ink)]">signale-le immédiatement</strong>.
          Nous le retirons et pouvons transmettre aux autorités compétentes.
        </p>
        <Link
          href="/contact/signalement"
          className="mt-4 inline-flex rounded-full bg-red-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-600"
        >
          Signaler un contenu →
        </Link>
      </div>

      <h2 className="mt-10 text-xl font-bold">Autres contenus interdits</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--color-ink-muted)]">
        <li>Tout contenu non consensuel, revenge porn, doxxing</li>
        <li>Violence extrême, menaces, terrorisme</li>
        <li>Spam, malware, fraudes</li>
        <li>Violation de droits d’auteur (voir aussi DMCA)</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">Comment signaler</h2>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        Utilise le{" "}
        <Link href="/contact/signalement" className="font-semibold text-[var(--color-accent)]">
          formulaire de signalement
        </Link>
        , le lien DMCA, ou écris à{" "}
        <a className="text-[var(--color-accent)]" href="mailto:abuse@leakfanhub.com">
          abuse@leakfanhub.com
        </a>
        .
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/contact/signalement"
          className="rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-bold text-white"
        >
          Formulaire signalement
        </Link>
        <Link
          href="/dmca"
          className="rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold"
        >
          DMCA
        </Link>
        <Link
          href="/contact"
          className="rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold"
        >
          Contact
        </Link>
      </div>
    </div>
  );
}
