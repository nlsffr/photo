import type { Metadata } from "next";
import { LocalizedLink as Link } from "@/components/LocalizedLink";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  alternates: { canonical: "/confidentialite" },
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      updated="4 novembre 2026"
      intro="LeakFanHub est conçu « privacy by default ». Voici, concrètement, ce que nous faisons — et surtout ce que nous ne faisons pas — de tes données."
      sections={[
        {
          heading: "Mesure d’audience facultative",
          body: <p>Si tu acceptes, un identifiant de navigateur permet de compter les visites et les pages vues et d’estimer leur pays. Tu peux refuser et utiliser le site. Le lien « Choix des cookies » en bas de page permet de modifier ton choix.</p>,
        },
        {
          heading: "Publicités partenaires facultatives",
          body: <p>Après acceptation des publicités et de leurs traceurs, TrafficStars et ExoClick peuvent recevoir les données techniques nécessaires à leurs annonces, notamment l’adresse IP, les caractéristiques du navigateur et les interactions publicitaires. Leurs scripts peuvent utiliser des cookies ou le stockage du navigateur. Sans cette acceptation, leurs intégrations restent désactivées. Les comptes Premium ne reçoivent pas ces publicités. Tu peux modifier ton choix depuis « Choix des cookies » en bas de page. Consulter les politiques de <a href="https://trafficstars.com/privacy-policy/" rel="noopener noreferrer" target="_blank" className="underline">TrafficStars</a> et <a href="https://www.exoclick.com/privacy-policy/" rel="noopener noreferrer" target="_blank" className="underline">ExoClick</a>.</p>,
        },
        {
          heading: "Mesure agrégée des pages",
          body: <p>Un compteur séparé mesure les chargements de pages sans cookie ni identifiant personnel de visiteur. Il couvre aussi les refus des statistiques facultatives et ne permet pas de compter exactement les personnes.</p>,
        },
        {
          heading: "Mesure du site",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
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
