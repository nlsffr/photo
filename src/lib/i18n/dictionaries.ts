import type { Locale } from "./config.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { enDictionary, type Dictionary } from "./dictionaries/en.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { frDictionary } from "./dictionaries/fr.ts";

const DICTIONARIES: Record<Locale, Dictionary> = {
  en: enDictionary,
  fr: frDictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

export type { Dictionary };
