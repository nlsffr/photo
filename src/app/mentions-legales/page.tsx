import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Mentions légales" };

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions légales"
      updated="6 août 2026"
      sections={[
        {
          heading: "Éditeur du site",
          body: (
            <p>
              LeakFanHub est un projet indépendant. Les informations légales de
              l’éditeur (raison sociale, adresse, contact du responsable de
              publication) sont à compléter selon le statut choisi pour
              l’exploitation du site.
            </p>
          ),
        },
        {
          heading: "Hébergement",
          body: (
            <p>
              Le site est hébergé sur un VPS dédié. Les coordonnées détaillées de
              l’hébergeur seront précisées ici selon l’infrastructure en
              production.
            </p>
          ),
        },
        {
          heading: "Propriété intellectuelle",
          body: (
            <p>
              La structure du site, son design et ses éléments graphiques sont
              protégés. Le contenu appartient à ses auteurs respectifs. Pour tout
              signalement de contenu, voir la page{" "}
              <Link href="/dmca" className="text-[var(--color-accent)] hover:underline">
                DMCA
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Pour toute question d’ordre légal, utilise la page{" "}
              <Link href="/contact" className="text-[var(--color-accent)] hover:underline">
                Contact
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
