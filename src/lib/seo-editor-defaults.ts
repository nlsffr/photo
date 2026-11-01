import { getDictionary } from "./i18n/dictionaries";
import type { SeoEditorEntry, SeoLocale, SeoPageKey } from "./seo-editor-contract";

// Existing localized layout template; parity is checked opaquely for all layouts.
const TITLE_TEMPLATE = "%s · LeakFanHub";

export function getSeoDefault(locale: SeoLocale, page: SeoPageKey): SeoEditorEntry {
  const copy = getDictionary(locale).pages[page].meta;
  return { page, locale, title: page === "home" ? copy.title : TITLE_TEMPLATE.replace(/%s/g, copy.title),
    description: copy.description, revision: 0, updatedAt: null, source: "default" };
}
