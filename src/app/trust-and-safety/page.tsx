import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trust & Safety",
  description: "Politique de modération et signalement",
};

export default function TrustAndSafetyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 prose-invert">
      <h1 className="text-3xl font-bold">Trust & Safety</h1>
      <p className="mt-4 text-[var(--color-ink-muted)]">
        LumenGallery applique une tolérance zéro pour le contenu illégal.
      </p>
      <h2 className="mt-8 text-xl font-bold">Contenu strictement interdit</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--color-ink-muted)]">
        <li>Tout contenu impliquant des mineurs (moins de 18 ans) — tolérance zéro</li>
        <li>Contenu non consensuel, revenge porn, doxxing</li>
        <li>Violence extrême, menaces, terrorisme</li>
        <li>Spam, malware, fraudes</li>
      </ul>
      <h2 className="mt-8 text-xl font-bold">Signaler un contenu</h2>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        Utilise le formulaire de signalement ou écris à{" "}
        <a className="text-[var(--color-accent)]" href="mailto:abuse@lumengallery.com">
          abuse@lumengallery.com
        </a>
        . Pour les demandes DMCA, passe par{" "}
        <Link href="/dmca" className="text-[var(--color-accent)]">
          /dmca
        </Link>
        .
      </p>
      <p className="mt-6 text-sm">
        <Link href="/contact/signalement" className="font-semibold text-[var(--color-accent)]">
          Formulaire de signalement →
        </Link>
      </p>
    </div>
  );
}
