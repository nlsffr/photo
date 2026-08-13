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
    default: "Latest OnlyFans Leaks - LeakFanHub",
    template: "%s · LeakFanHub",
  },
  description:
    "Find exclusive content from your favorite OnlyFans models here. LeakFanHub is a free OnlyFans leaks gallery — photos, videos, trending creators updated daily. 18+ only.",
  applicationName: "LeakFanHub",
  authors: [{ name: "LeakFanHub" }],
  keywords: [
    "OnlyFans leaks",
    "OnlyFans leak",
    "OnlyFans models",
    "leaked OnlyFans",
    "free OnlyFans",
    "LeakFanHub",
    "creator leaks",
    "OnlyFans videos",
    "OnlyFans photos",
  ],
  alternates: {
    canonical: "/",
  },
  // Explicit icons for Google (≥48px) + browsers
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon", type: "image/png", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon"],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE,
    siteName: "LeakFanHub",
    title: "Latest OnlyFans Leaks - LeakFanHub",
    description:
      "Free OnlyFans leaks gallery. Browse photos and videos from popular creators. Updated daily. 18+.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Latest OnlyFans Leaks - LeakFanHub",
    description:
      "Free OnlyFans leaks gallery. Photos, videos, trending models. 18+.",
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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <LocaleProvider>
          <SessionProvider>
            <AnonIdentityProvider>
              <InteractionsProvider>
                <PremiumProvider>
                  <AgeGate>
                    <AppShell>{children}</AppShell>
                    <CookieBanner />
                  </AgeGate>
                </PremiumProvider>
              </InteractionsProvider>
            </AnonIdentityProvider>
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
