import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { InteractionsProvider } from "@/components/Interactions";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <InteractionsProvider>
          <AppShell>{children}</AppShell>
        </InteractionsProvider>
      </body>
    </html>
  );
}
