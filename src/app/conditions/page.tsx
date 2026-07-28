import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Conditions d’utilisation" };

export default function ConditionsPage() {
  return (
    <LegalPage
      title="Conditions d’utilisation"
      updated="28 juillet 2026"
      intro="En accédant à LumenGallery, tu acceptes les conditions ci-dessous. Lis-les attentivement."
      sections={[
        {
          heading: "Accès au service",
          body: (
            <p>
              LumenGallery est une galerie de photos et de vidéos accessible
              gratuitement. L’accès en simple consultation ne nécessite pas de
              compte. Certaines fonctionnalités (enregistrements, abonnements)
              peuvent nécessiter une identité, anonyme ou avec e-mail.
            </p>
          ),
        },
        {
          heading: "Contenu et droits",
          body: (
            <p>
              Le contenu publié doit respecter les droits de propriété
              intellectuelle et les droits des personnes. Tu t’engages à ne
              publier que du contenu dont tu détiens les droits ou pour lequel tu
              as une autorisation. Toute atteinte peut être signalée via la page{" "}
              <Link href="/dmca" className="text-[var(--color-accent)] hover:underline">
                DMCA
              </Link>
              .
            </p>
          ),
        },
        {
          heading: "Comportements interdits",
          body: (
            <p>
              Sont interdits : le harcèlement, l’usurpation d’identité, la
              publication de contenu illégal ou non consenti, le contournement
              des mesures de sécurité et l’usage automatisé abusif du service.
            </p>
          ),
        },
        {
          heading: "Responsabilité",
          body: (
            <p>
              Le service est fourni « en l’état ». Nous nous efforçons d’assurer
              sa disponibilité et sa sécurité sans pouvoir la garantir de manière
              absolue.
            </p>
          ),
        },
        {
          heading: "Modifications",
          body: (
            <p>
              Ces conditions peuvent évoluer. Les changements importants seront
              signalés sur cette page, avec une nouvelle date de mise à jour.
            </p>
          ),
        },
      ]}
    />
  );
}
