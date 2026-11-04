import { Suspense } from "react";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { AnonIdentityProvider } from "@/components/AnonIdentity";
import { AppShell } from "@/components/AppShell";
import { CookieBanner } from "@/components/CookieBanner";
import { InteractionsProvider } from "@/components/Interactions";
import InternalLinks from "@/components/InternalLinks";
import { LocaleProvider } from "@/components/LocaleProvider";
import { NavProgress } from "@/components/NavProgress";
import { PremiumProvider } from "@/components/Premium";
import { SessionProvider } from "@/components/Session";
import { AdsProvider } from "@/components/AdsProvider";
import { AdsOverlays } from "@/components/AdSlot";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export function SiteRootLayout({
  children,
  locale,
  dictionary,
}: {
  children: React.ReactNode;
  locale: Locale;
  dictionary: Dictionary;
}) {
  return (
    <html lang={locale} className="h-full antialiased">
      <head>
        <meta name="Trafficstars" content="89019" />
      </head>
      <body className="min-h-full">
        <LocaleProvider locale={locale} dictionary={dictionary}>
          <SessionProvider>
            <PremiumProvider>
              <AdsProvider>
              <AnonIdentityProvider>
                <InteractionsProvider>
                  <Suspense fallback={null}>
                    <NavProgress />
                    <AnalyticsBeacon />
                  </Suspense>
                  <AppShell>
                    {children}
                    <div className="mx-auto max-w-7xl px-4">
                      <InternalLinks locale={locale} />
                    </div>
                  </AppShell>
                  <CookieBanner />
                  <AdsOverlays />
                </InteractionsProvider>
              </AnonIdentityProvider>
              </AdsProvider>
            </PremiumProvider>
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
