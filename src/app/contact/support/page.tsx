import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = { title: "Support & aide" };

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/contact"
        className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        ← Contact
      </Link>
      <h1 className="mt-3 text-3xl font-black tracking-tight">Support & aide</h1>
      <p className="mt-3 text-[var(--color-ink-muted)]">
        Un bug, un problème d’affichage, une question sur ton compte ou tes
        enregistrements ? Décris ton souci — plus tu es précis (appareil,
        navigateur, page concernée), plus vite on t’aide.
      </p>

      <div className="mt-8">
        <ContactForm
          kind="support"
          fields={[
            { name: "email", label: "Ton e-mail", type: "email", placeholder: "toi@exemple.com", required: true },
            { name: "page", label: "Page ou URL concernée", type: "text", placeholder: "ex. /feed" },
          ]}
          reasons={[
            "Problème d’affichage",
            "Bug technique",
            "Question sur mon compte",
            "Enregistrements / likes perdus",
            "Autre",
          ]}
        />
      </div>
    </div>
  );
}
