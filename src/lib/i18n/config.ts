// @ts-expect-error Node’s native type stripping requires the explicit .ts suffix.
import { parseCreatorCollectionPath } from "../creator-collections.ts";

export const LOCALES = ["en", "fr", "es", "de", "it", "pt", "nl"] as const;
export type Locale = (typeof LOCALES)[number];
export const CREATOR_LOCALES = LOCALES;
export type CreatorLocale = (typeof CREATOR_LOCALES)[number];
const FUNCTIONAL_LOCALES = ["en", "fr"] as const;

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lfh_locale";

/** Only these six routes have full translations in all discovery languages. */
export const DISCOVERY_ROUTE_PATHS = [
  "/",
  "/models",
  "/trending-medias",
  "/most-liked",
  "/classements",
  "/influenceuses-tendances",
] as const;

/** Exact static routes; functional and editorial pages remain English/French. */
export const LOCALIZED_ROUTE_PATHS = [
  ...DISCOVERY_ROUTE_PATHS,
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
const DISCOVERY_ROUTES = new Set<string>(DISCOVERY_ROUTE_PATHS);

export function localesForPath(pathname: string): readonly Locale[] {
  const { pathname: unprefixed } = stripLocalePrefix(pathname);
  return DISCOVERY_ROUTES.has(unprefixed) || contentRoute(unprefixed)
    ? LOCALES
    : FUNCTIONAL_LOCALES;
}

export function supportedLocaleForPath(locale: Locale, pathname: string): Locale {
  return localesForPath(pathname).includes(locale) ? locale : DEFAULT_LOCALE;
}

function contentRoute(pathname: string) {
  if (!/^\/[^/?#]+(?:\/[^/?#]+)?$/.test(pathname)) return null;
  // The dispatcher receives an unprefixed path; nested locales are never creators.
  if (stripLocalePrefix(pathname).locale) return null;
  const creator = parseCreatorCollectionPath(pathname);
  if (creator) return { kind: "creator" as const, ...creator };
  const segments = pathname.slice(1).split("/");
  if (segments.length !== 2) return null;
  const owner = parseCreatorCollectionPath(`/${segments[0]}`);
  if (!owner) return null;
  let id: string;
  try { id = decodeURIComponent(segments[1]); } catch { return null; }
  if (!/^[a-zA-Z0-9._-]{1,191}$/.test(id) || id === "." || id === "..") return null;
  return { kind: "media" as const, handle: owner.handle, id };
}

/** Exact static routes and creator collections win over colliding media IDs. */
export function resolveLocalizedPage(locale: Locale, pathname: string) {
  if (!isLocale(locale)) return null;
  if (LOCALIZED_ROUTES.has(pathname)) {
    return localesForPath(pathname).includes(locale)
      ? { kind: "static" as const, pathname }
      : null;
  }
  return contentRoute(pathname);
}

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

export function isCreatorLocale(value: unknown): value is CreatorLocale {
  return typeof value === "string" && CREATOR_LOCALES.includes(value as CreatorLocale);
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
  const match = normalized.match(/^\/([^/]+)(?:\/|$)/);
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
    ? `${localePath(supportedLocaleForPath(locale, pathname), pathname)}${suffix}`
    : href;
}

export function switchLocalePath(pathname: string, locale: Locale): string {
  const current = stripLocalePrefix(pathname);
  if (current.locale || isLocalizedRoute(current.pathname)) {
    return localePath(supportedLocaleForPath(locale, current.pathname), current.pathname);
  }
  return current.pathname;
}

export function localeAlternates(pathname: string): Record<string, string> {
  const { pathname: unprefixed } = stripLocalePrefix(pathname);
  return {
    ...Object.fromEntries(localesForPath(unprefixed).map((locale) => [
      locale, localePath(locale, unprefixed),
    ])),
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

export function defaultShellLocale(cookieValue?: string | null): Locale {
  return isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
}

export function isSystemPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (SYSTEM_PATHS.has(normalized) || ASSET_EXTENSION.test(normalized)) return true;
  return SYSTEM_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

export function isLocalizedRoute(pathname: string): boolean {
  const { pathname: unprefixed } = stripLocalePrefix(pathname);
  return LOCALIZED_ROUTES.has(unprefixed) || contentRoute(unprefixed) !== null;
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
  const locale = supportedLocaleForPath(chooseLocale(cookieValue, acceptLanguage), stripped.pathname);
  return localePath(locale, stripped.pathname);
}
