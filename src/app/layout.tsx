import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { InteractionsProvider } from "@/components/Interactions";
import { AnonIdentityProvider } from "@/components/AnonIdentity";
import { SessionProvider } from "@/components/Session";
import { AgeGate } from "@/components/AgeGate";
import { LocaleProvider } from "@/components/LocaleProvider";
import { PremiumProvider } from "@/components/Premium";
import { CookieBanner } from "@/components/CookieBanner";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "LeakFanHub — photos & vidéos 18+",
    template: "%s · LeakFanHub",
  },
  description:
    "LeakFanHub — photos et vidéos de créateurs. Feed, modèles, tags. Contenu réservé aux adultes (18+).",
  applicationName: "LeakFanHub",
  authors: [{ name: "LeakFanHub" }],
  keywords: ["LeakFanHub", "photos", "vidéos", "créateurs", "modèles", "feed"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE,
    siteName: "LeakFanHub",
    title: "LeakFanHub — photos & vidéos 18+",
    description:
      "Découverte de photos et vidéos. Feed, créateurs, tags. 18+.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeakFanHub — photos & vidéos 18+",
    description: "Découverte de photos et vidéos. Feed, créateurs, tags. 18+.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">
        <LocaleProvider>
          <SessionProvider>
            <PremiumProvider>
              <AnonIdentityProvider>
                <InteractionsProvider>
                  <AgeGate />
                  <AppShell>{children}</AppShell>
                  <CookieBanner />
                </InteractionsProvider>
              </AnonIdentityProvider>
            </PremiumProvider>
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
