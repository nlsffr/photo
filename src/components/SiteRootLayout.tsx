import { Suspense } from "react";
import { AgeGate } from "@/components/AgeGate";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { AnonIdentityProvider } from "@/components/AnonIdentity";
import { AppShell } from "@/components/AppShell";
import { CookieBanner } from "@/components/CookieBanner";
import { InteractionsProvider } from "@/components/Interactions";
import { LocaleProvider } from "@/components/LocaleProvider";
import { NavProgress } from "@/components/NavProgress";
import { PremiumProvider } from "@/components/Premium";
import { SessionProvider } from "@/components/Session";
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
      <body className="min-h-full">
        <LocaleProvider locale={locale} dictionary={dictionary}>
          <SessionProvider>
            <PremiumProvider>
              <AnonIdentityProvider>
                <InteractionsProvider>
                  <Suspense fallback={null}>
                    <NavProgress />
                    <AnalyticsBeacon />
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
