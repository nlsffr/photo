import type { Metadata } from "next";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { localeAlternates, localePath, type Locale } from "./config.ts";

export type LocalizedMetadataCopy = {
  title: string;
  description: string;
};

export function buildLocalizedMetadata(
  locale: Locale,
  pathname: string,
  copy: LocalizedMetadataCopy,
): Metadata {
  const canonical = localePath(locale, pathname);
  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical,
      languages: localeAlternates(pathname),
    },
    openGraph: {
      type: "website",
      locale: locale === "fr" ? "fr_FR" : "en_US",
      alternateLocale: locale === "fr" ? ["en_US"] : ["fr_FR"],
      title: copy.title,
      description: copy.description,
      url: canonical,
      siteName: "LeakFanHub",
    },
    robots: { index: true, follow: true, "max-image-preview": "large" },
  };
}
