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

export const metadata: Metadata = {
  title: {
    default: "LeakFanHub — photos & vidéos",
    template: "%s · LeakFanHub",
  },
  description:
    "LeakFanHub — découverte de photos et vidéos. Feed, créateurs, tags. 18+.",
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
