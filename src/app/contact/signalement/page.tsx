import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = { title: "Signaler un contenu" };

export default function SignalementPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/contact"
        className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        ← Contact
      </Link>
      <h1 className="mt-3 text-3xl font-black tracking-tight">
        Signaler un contenu
      </h1>
      <p className="mt-3 text-[var(--color-ink-muted)]">
        Utilise ce formulaire pour signaler un contenu qui enfreint nos règles :
        contenu inapproprié, usurpation d’identité, atteinte à la vie privée ou
        harcèlement. Pour une demande de retrait pour droit d’auteur, utilise
        plutôt la page{" "}
        <Link href="/dmca" className="text-[var(--color-accent)] hover:underline">
          DMCA
        </Link>
        .
      </p>

      <div className="mt-8">
        <ContactForm
          kind="signalement"
          submitLabel="Envoyer le signalement"
          fields={[
            { name: "email", label: "Ton e-mail", type: "email", placeholder: "toi@exemple.com", required: true },
            { name: "url", label: "Lien du contenu signalé", type: "url", placeholder: "https://lumengallery.example/photo/…", required: true },
          ]}
          reasons={[
            "Contenu inapproprié",
            "Usurpation d’identité",
            "Atteinte à la vie privée",
            "Harcèlement",
            "Spam / arnaque",
            "Autre",
          ]}
        />
      </div>
    </div>
  );
}
