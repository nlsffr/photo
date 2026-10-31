import type { Metadata } from "next";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { LOCALES, localeAlternates, localePath, localesForPath, stripLocalePrefix, supportedLocaleForPath, type Locale, type CreatorLocale } from "./config.ts";

// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { creatorCollectionPath, type CreatorCollection } from "../creator-collections.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { modelsPagePath, parseModelsSearch, type ModelsSearchParams } from "../models-pagination.ts";

export function modelsPageAlternates(searchParams: ModelsSearchParams, locale?: Locale) {
  const search = parseModelsSearch(searchParams);
  return {
    canonical: modelsPagePath(locale ? localePath(locale, "/models") : "/models", search),
    languages: Object.fromEntries(Object.entries(localeAlternates("/models")).map(
      ([language, path]) => [language, modelsPagePath(path, search)],
    )),
  };
}

export function creatorCollectionAlternates(
  handle: string,
  version: number,
  collection: CreatorCollection,
  locale?: CreatorLocale,
  page = 1,
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: creatorCollectionPath(handle, version, collection, locale, page),
    languages: {
      ...Object.fromEntries(LOCALES.map((language) => [language,
        creatorCollectionPath(handle, version, collection, language, page),
      ])),
      "x-default": creatorCollectionPath(handle, version, collection, undefined, page),
    },
  };
}

export type LocalizedMetadataCopy = {
  title: string;
  description: string;
};

const OPEN_GRAPH_LOCALES: Record<Locale, string> = {
  en: "en_US", fr: "fr_FR", es: "es_ES", de: "de_DE",
  it: "it_IT", pt: "pt_PT", nl: "nl_NL",
};

export function openGraphLocale(locale?: Locale): string {
  return OPEN_GRAPH_LOCALES[locale ?? "en"];
}

export function openGraphAlternateLocales(locale?: Locale): string[] {
  return LOCALES.filter((language) => language !== (locale ?? "en"))
    .map((language) => OPEN_GRAPH_LOCALES[language]);
}

export function mediaPageAlternates(bareCanonicalPath: string, locale?: Locale) {
  const { pathname } = stripLocalePrefix(bareCanonicalPath);
  return {
    canonical: locale ? localePath(locale, pathname) : pathname,
    languages: localeAlternates(pathname),
  };
}

export function buildLocalizedMetadata(
  locale: Locale,
  pathname: string,
  copy: LocalizedMetadataCopy,
  searchParams: ModelsSearchParams = {},
): Metadata {
  const renderedLocale = supportedLocaleForPath(locale, pathname);
  const alternates = pathname === "/models"
    ? modelsPageAlternates(searchParams, renderedLocale)
    : { canonical: localePath(renderedLocale, pathname), languages: localeAlternates(pathname) };
  return {
    title: copy.title,
    description: copy.description,
    alternates,
    openGraph: {
      type: "website",
      locale: OPEN_GRAPH_LOCALES[renderedLocale],
      alternateLocale: localesForPath(pathname)
        .filter((alternate) => alternate !== renderedLocale)
        .map((alternate) => OPEN_GRAPH_LOCALES[alternate]),
      title: copy.title,
      description: copy.description,
      url: alternates.canonical,
      siteName: "LeakFanHub",
    },
    robots: { index: true, follow: true, "max-image-preview": "large" },
  };
}
