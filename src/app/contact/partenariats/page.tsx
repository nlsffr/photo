import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = { title: "Partenariats & créateurs" };

export default function PartenariatsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/contact"
        className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        ← Contact
      </Link>
      <h1 className="mt-3 text-3xl font-black tracking-tight">
        Partenariats & créateurs
      </h1>
      <p className="mt-3 text-[var(--color-ink-muted)]">
        Tu es modèle, photographe ou créateur et tu veux publier ta galerie sur
        LumenGallery ? Tu représentes une marque ou un projet et veux collaborer ?
        Présente-toi ci-dessous, on regarde chaque demande.
      </p>

      <div className="mt-8">
        <ContactForm
          submitLabel="Envoyer ma demande"
          fields={[
            { name: "email", label: "Ton e-mail", type: "email", placeholder: "toi@exemple.com", required: true },
            { name: "name", label: "Nom ou pseudo", type: "text", placeholder: "ton nom d’artiste", required: true },
            { name: "link", label: "Lien vers ton travail (portfolio, réseau…)", type: "url", placeholder: "https://…" },
          ]}
          reasons={[
            "Devenir créateur / modèle",
            "Partenariat de marque",
            "Collaboration éditoriale",
            "Autre",
          ]}
        />
      </div>
    </div>
  );
}
