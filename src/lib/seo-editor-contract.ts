export const SEO_PAGES = [
  { key: "home", label: "Accueil", path: "/" },
  { key: "models", label: "Modèles", path: "/models" },
  { key: "trending", label: "Tendances", path: "/trending-medias" },
  { key: "mostLiked", label: "Plus aimés", path: "/most-liked" },
  { key: "rankings", label: "Classements", path: "/classements" },
  { key: "influencers", label: "Créateurs tendance", path: "/influenceuses-tendances" },
] as const;

export type SeoPageKey = (typeof SEO_PAGES)[number]["key"];
export type SeoLocale = "en" | "fr" | "es" | "de" | "it" | "pt" | "nl";

export const SEO_LANGUAGES: ReadonlyArray<{ code: SeoLocale; label: string }> = [
  { code: "fr", label: "Français" }, { code: "en", label: "English" },
  { code: "es", label: "Español" }, { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" }, { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
];

export type SeoEditorEntry = {
  page: SeoPageKey;
  locale: SeoLocale;
  title: string;
  description: string;
  revision: number;
  updatedAt: string | null;
  source: "default" | "saved";
};

export type SeoEditorPayload = {
  entries: SeoEditorEntry[];
};

export type SeoEditorSave = Pick<SeoEditorEntry, "page" | "locale" | "title" | "description" | "revision">;

export const SEO_TITLE_LIMIT = 300;
export const SEO_DESCRIPTION_LIMIT = 2000;
