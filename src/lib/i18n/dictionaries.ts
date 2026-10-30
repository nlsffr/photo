import type { Locale } from "./config.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { enDictionary, type Dictionary } from "./dictionaries/en.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { frDictionary } from "./dictionaries/fr.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { esDictionary } from "./dictionaries/es.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { deDictionary } from "./dictionaries/de.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { itDictionary } from "./dictionaries/it.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { ptDictionary } from "./dictionaries/pt.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { nlDictionary } from "./dictionaries/nl.ts";

const DICTIONARIES: Record<Locale, Dictionary> = {
  en: enDictionary,
  fr: frDictionary,
  es: esDictionary,
  de: deDictionary,
  it: itDictionary,
  pt: ptDictionary,
  nl: nlDictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export type { Dictionary };
