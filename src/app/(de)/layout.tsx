import type { Metadata, Viewport } from "next";
import "../globals.css";
import { SiteRootLayout } from "@/components/SiteRootLayout";
import { getDictionary } from "@/lib/i18n/dictionaries";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://leakfanhub.com").replace(/\/$/, "");
const dictionary = getDictionary("de");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: dictionary.pages.home.meta.title, template: "%s · LeakFanHub" },
  description: dictionary.pages.home.meta.description,
  applicationName: "LeakFanHub",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon", type: "image/png", sizes: "48x48" }],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0b",
};

export default function LocalizedDiscoveryRootLayout({ children }: { children: React.ReactNode }) {
  return <SiteRootLayout locale="de" dictionary={dictionary}>{children}</SiteRootLayout>;
}
