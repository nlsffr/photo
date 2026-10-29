export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lfh_locale";

/**
 * Routes whose shell and primary content are available in both languages.
 * Creator, media and tag pages intentionally stay unprefixed until their
 * primary database content can be localized without creating thin duplicates.
 */
export const LOCALIZED_ROUTE_PATHS = [
  "/",
  "/models",
  "/trending-medias",
  "/most-liked",
  "/classements",
  "/influenceuses-tendances",
  "/about",
  "/dmca",
  "/trust-and-safety",
  "/contact",
  "/contact/support",
  "/contact/signalement",
  "/contact/partenariats",
  "/contact/presse",
  "/conditions",
  "/confidentialite",
  "/mentions-legales",
  "/qu-est-ce-que-lumengallery",
  "/recherche",
  "/feed",
  "/random/medias",
  "/pour-toi",
  "/abonnements",
  "/favoris",
  "/add",
  "/premium",
  "/connexion",
  "/inscription",
] as const;

const LOCALIZED_ROUTES = new Set<string>(LOCALIZED_ROUTE_PATHS);
const SYSTEM_PREFIXES = [
  "/api",
  "/_next",
  "/sitemaps",
  "/media",
] as const;
const SYSTEM_PATHS = new Set([
  "/favicon.ico",
  "/favicon.svg",
  "/robots.txt",
  "/sitemap.xml",
  "/icon",
  "/apple-icon",
]);
const ASSET_EXTENSION =
  /\.(?:avif|css|gif|ico|jpe?g|js|json|map|mp4|png|svg|webm|webp|woff2?)$/i;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

function normalizePathname(pathname: string): string {
  const clean = (pathname.split(/[?#]/, 1)[0] || "/").trim();
  if (!clean || clean === "/") return "/";
  const withSlash = clean.startsWith("/") ? clean : `/${clean}`;
  return withSlash.replace(/\/{2,}/g, "/").replace(/\/$/, "");
}

export function stripLocalePrefix(pathname: string): {
  locale: Locale | null;
  pathname: string;
} {
  const normalized = normalizePathname(pathname);
  const match = normalized.match(/^\/(en|fr)(?:\/|$)/);
  if (!match || !isLocale(match[1])) {
    return { locale: null, pathname: normalized };
  }
  const remainder = normalized.slice(match[0].length - (match[0].endsWith("/") ? 1 : 0));
  return {
    locale: match[1],
    pathname: normalizePathname(remainder || "/"),
  };
}

export function localePath(locale: Locale, pathname: string): string {
  const { pathname: unprefixed } = stripLocalePrefix(pathname);
  return unprefixed === "/" ? `/${locale}` : `/${locale}${unprefixed}`;
}

export function localizedHref(locale: Locale, href: string): string {
  const match = href.match(/^([^?#]*)(.*)$/);
  const pathname = match?.[1] || href;
  const suffix = match?.[2] || "";
  return isLocalizedRoute(pathname)
    ? `${localePath(locale, pathname)}${suffix}`
    : href;
}

export function switchLocalePath(pathname: string, locale: Locale): string {
  const current = stripLocalePrefix(pathname);
  if (current.locale || LOCALIZED_ROUTES.has(current.pathname)) {
    return localePath(locale, current.pathname);
  }
  return current.pathname;
}

export function localeAlternates(pathname: string): Record<Locale | "x-default", string> {
  const { pathname: unprefixed } = stripLocalePrefix(pathname);
  return {
    en: localePath("en", unprefixed),
    fr: localePath("fr", unprefixed),
    "x-default": unprefixed,
  };
}

export function chooseLocale(
  cookieValue?: string | null,
  acceptLanguage?: string | null,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;

  const candidates = (acceptLanguage || "")
    .split(",")
    .map((entry, index) => {
      const [rawTag, ...params] = entry.trim().toLowerCase().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const parsedQ = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return {
        locale: rawTag?.split("-")[0],
        quality: Number.isFinite(parsedQ) ? parsedQ : 0,
        index,
      };
    })
    .filter((candidate) => candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const candidate of candidates) {
    if (isLocale(candidate.locale)) return candidate.locale;
  }
  return DEFAULT_LOCALE;
}

export function isSystemPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (SYSTEM_PATHS.has(normalized) || ASSET_EXTENSION.test(normalized)) return true;
  return SYSTEM_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function isLocalizedRoute(pathname: string): boolean {
  return LOCALIZED_ROUTES.has(normalizePathname(pathname));
}

export function localeRedirectTarget(
  pathname: string,
  cookieValue?: string | null,
  acceptLanguage?: string | null,
): string | null {
  const normalized = normalizePathname(pathname);
  if (isSystemPath(normalized)) return null;
  const stripped = stripLocalePrefix(normalized);
  if (stripped.locale || !LOCALIZED_ROUTES.has(stripped.pathname)) return null;
  return localePath(chooseLocale(cookieValue, acceptLanguage), stripped.pathname);
}
