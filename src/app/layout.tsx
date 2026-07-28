import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { InteractionsProvider } from "@/components/Interactions";
import { AnonIdentityProvider } from "@/components/AnonIdentity";
import { SessionProvider } from "@/components/Session";

// No external font provider: we use the OS's own font stack (defined in
// globals.css). This means ZERO network contact with any font CDN — not at
// build time, not at runtime — so nothing about the visitor is ever sent to
// a third party for fonts. It's also faster (no font download at all).

export const metadata: Metadata = {
  title: {
    default: "LumenGallery — galerie de photographes",
    template: "%s · LumenGallery",
  },
  description:
    "LumenGallery — galerie de photographie communautaire : portraits, mode et éditorial.",
};

// Plain website viewport. viewport-fit=cover just lets us respect the iPhone
// notch/safe-areas in Safari — it does NOT make this an installable app.
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
        <SessionProvider>
          <AnonIdentityProvider>
            <InteractionsProvider>
              <AppShell>{children}</AppShell>
            </InteractionsProvider>
          </AnonIdentityProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
