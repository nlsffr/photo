import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      updated="6 août 2026"
      intro="LeakFanHub est conçu « privacy by default ». Voici, concrètement, ce que nous faisons — et surtout ce que nous ne faisons pas — de tes données."
      sections={[
        {
          heading: "Ce que nous NE collectons pas",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Aucun cookie publicitaire (sauf si tu n’es pas Premium et que des pubs partenaires s’affichent).</li>
              <li>Aucun analytics tiers de type Google Analytics.</li>
              <li>Aucune conservation d’adresses IP à des fins de suivi marketing.</li>
              <li>Aucun « fingerprinting » du navigateur.</li>
            </ul>
          ),
        },
        {
          heading: "Données stockées sur ton appareil",
          body: (
            <p>
              Tes likes, enregistrements et modèles suivis sont stockés{" "}
              <strong>localement dans ton navigateur</strong> (localStorage), pas
              sur nos serveurs, tant que tu ne crées pas de compte pour les
              synchroniser.
            </p>
          ),
        },
        {
          heading: "Identité anonyme",
          body: (
            <p>
              Tu peux utiliser LeakFanHub avec une{" "}
              <Link href="/identite" className="text-[var(--color-accent)] hover:underline">
                identité anonyme
              </Link>{" "}
              générée sur ton appareil, sans e-mail ni information personnelle.
            </p>
          ),
        },
        {
          heading: "Comptes (optionnels)",
          body: (
            <p>
              Si tu crées un compte, ton e-mail sert uniquement à te reconnecter
              et n’est jamais revendu. Les mots de passe sont hachés et jamais
              stockés en clair.
            </p>
          ),
        },
        {
          heading: "Tes droits (RGPD)",
          body: (
            <p>
              Tu peux à tout moment effacer tes données locales et, si tu as un
              compte, demander sa suppression via la page{" "}
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
