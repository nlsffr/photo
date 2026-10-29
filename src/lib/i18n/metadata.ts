import type { Metadata } from "next";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { localeAlternates, localePath, type Locale } from "./config.ts";

// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { creatorCollectionPath, type CreatorCollection } from "../creator-collections.ts";

export function creatorCollectionAlternates(
  handle: string,
  version: number,
  collection: CreatorCollection,
  locale?: Locale,
  page = 1,
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: creatorCollectionPath(handle, version, collection, locale, page),
    languages: {
      en: creatorCollectionPath(handle, version, collection, "en", page),
      fr: creatorCollectionPath(handle, version, collection, "fr", page),
      "x-default": creatorCollectionPath(handle, version, collection, undefined, page),
    },
  };
}

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
