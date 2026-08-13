import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { InteractionsProvider } from "@/components/Interactions";
import { AnonIdentityProvider } from "@/components/AnonIdentity";
import { SessionProvider } from "@/components/Session";
import { AgeGate } from "@/components/AgeGate";
import { LocaleProvider } from "@/components/LocaleProvider";
import { PremiumProvider } from "@/components/Premium";
import { CookieBanner } from "@/components/CookieBanner";
import { NavProgress } from "@/components/NavProgress";

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
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon", type: "image/png", sizes: "48x48" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.svg"],
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
  themeColor: "#0a0a0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-icon" />
      </head>
      <body className="min-h-full">
        <LocaleProvider>
          <SessionProvider>
            <PremiumProvider>
              <AnonIdentityProvider>
                <InteractionsProvider>
                  <Suspense fallback={null}>
                    <NavProgress />
                  </Suspense>
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
