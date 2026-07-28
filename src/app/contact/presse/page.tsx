import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = { title: "Presse & médias" };

export default function PressePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/contact"
        className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        ← Contact
      </Link>
      <h1 className="mt-3 text-3xl font-black tracking-tight">Presse & médias</h1>
      <p className="mt-3 text-[var(--color-ink-muted)]">
        Journalistes et médias : pour une interview, une demande d’information sur
        le projet ou l’accès aux ressources de marque (logo, captures), écris-nous
        ci-dessous. On répond en priorité aux demandes avec délai de publication.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-bold">Kit de marque</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Logo, couleurs et règles d’usage disponibles sur demande.
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-bold">Contact direct</h2>
          <p className="mt-1 font-mono text-sm text-[var(--color-ink)]">
            presse@lumengallery.example
          </p>
        </div>
      </div>

      <div className="mt-8">
        <ContactForm
          kind="presse"
          submitLabel="Envoyer la demande presse"
          fields={[
            { name: "email", label: "Ton e-mail professionnel", type: "email", placeholder: "toi@media.com", required: true },
            { name: "outlet", label: "Média / publication", type: "text", placeholder: "ex. Le Journal", required: true },
            { name: "deadline", label: "Délai de publication", type: "text", placeholder: "ex. 3 jours" },
          ]}
          reasons={["Demande d’interview", "Information sur le projet", "Kit de marque", "Autre"]}
        />
      </div>
    </div>
  );
}
