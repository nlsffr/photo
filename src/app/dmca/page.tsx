import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = { title: "DMCA — Retrait de contenu" };

const STEPS = [
  "Identifie l’œuvre protégée dont tu es titulaire des droits.",
  "Indique l’URL exacte du contenu à retirer sur LumenGallery.",
  "Confirme, de bonne foi, que cet usage n’est pas autorisé.",
  "Fournis tes coordonnées et une signature (ton nom complet).",
];

export default function DmcaPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">
        DMCA — Retrait de contenu
      </h1>
      <p className="mt-3 text-lg text-[var(--color-ink-muted)]">
        LumenGallery respecte les droits de propriété intellectuelle. Si un
        contenu publié enfreint tes droits d’auteur, tu peux en demander le
        retrait. Nous traitons chaque demande valide dans les meilleurs délais.
      </p>

      <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="font-bold">Comment déposer une demande de retrait</h2>
        <ol className="mt-3 flex flex-col gap-2.5">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-[var(--color-ink-muted)]">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-accent-soft)] text-xs font-bold text-[var(--color-accent)]">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-ink-muted)]">
        <h2 className="font-bold text-[var(--color-ink)]">Ce qu’une demande valide doit contenir</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Une description de l’œuvre protégée concernée.</li>
          <li>L’URL précise du contenu litigieux sur le site.</li>
          <li>
            Une déclaration de bonne foi que l’usage contesté n’est pas autorisé
            par le titulaire des droits, son agent ou la loi.
          </li>
          <li>
            Une déclaration que les informations fournies sont exactes et que tu
            es le titulaire des droits (ou son représentant autorisé).
          </li>
          <li>Tes coordonnées et ta signature électronique (nom complet).</li>
        </ul>
        <p className="mt-4">
          Toute demande abusive ou de mauvaise foi peut engager ta responsabilité.
          Un contenu retiré peut faire l’objet d’une contre-notification par la
          personne qui l’a publié.
        </p>
      </div>

      <h2 className="mt-10 text-2xl font-bold tracking-tight">
        Formulaire de retrait DMCA
      </h2>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        Remplis ce formulaire ou envoie ta notification à{" "}
        <span className="font-mono text-[var(--color-ink)]">
          dmca@lumengallery.example
        </span>
        .
      </p>

      <div className="mt-6">
        <ContactForm
          kind="dmca"
          submitLabel="Envoyer la notification"
          fields={[
            { name: "fullname", label: "Nom complet (signature)", type: "text", placeholder: "Prénom Nom", required: true },
            { name: "email", label: "E-mail de contact", type: "email", placeholder: "toi@exemple.com", required: true },
            { name: "work", label: "Œuvre protégée concernée", type: "text", placeholder: "Décris ou lie l’original", required: true },
            { name: "url", label: "URL du contenu à retirer", type: "url", placeholder: "https://lumengallery.example/photo/…", required: true },
          ]}
          reasons={[
            "Je suis le titulaire des droits",
            "Je représente le titulaire des droits",
          ]}
        />
      </div>

      <p className="mt-6 text-sm text-[var(--color-ink-muted)]">
        Besoin d’un autre type de contact ?{" "}
        <Link href="/contact" className="text-[var(--color-accent)] hover:underline">
          Voir toutes les options
        </Link>
        .
      </p>
    </div>
  );
}
