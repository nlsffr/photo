// A 2,000-row partition remains below the 50 MiB protocol limit even when
// every bounded title, description and media URL requires XML escaping.
export const MEDIA_SITEMAP_CHUNK_SIZE = 2_000;
const SITEMAP_PARTITION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isSitemapPartitionDate(value: string): boolean {
  if (!SITEMAP_PARTITION_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** A sitemap index may contain at most 50,000 child sitemap entries. */
const MAX_SITEMAPS_PER_INDEX = 50_000;
const NON_MEDIA_SITEMAPS = 7;
export const MAX_MEDIA_SITEMAP_FILES =
  MAX_SITEMAPS_PER_INDEX - NON_MEDIA_SITEMAPS;

const SAFE_TAG_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LEGACY_TAG_SLUG = /["']slug["']\s*:\s*["']([^"']+)["']/i;
const INTERNAL_REQUEST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "app",
  "photo-app",
  "photo-app-1",
  "photo-seo-candidate",
]);
const ALLOWED_RESERVED_TWO_SEGMENT_PATHS = new Set([
  "contact/partenariats",
  "contact/presse",
  "contact/signalement",
  "contact/support",
  "random/medias",
  "sitemaps/popular",
  "sitemaps/profiles",
  "sitemaps/static",
  "sitemaps/tags",
]);
const EXISTING_TOP_LEVEL_ROUTES = new Set([
  "abonnements",
  "about",
  "add",
  "apple-icon",
  "classements",
  "conditions",
  "confidentialite",
  "connexion",
  "contact",
  "dmca",
  "favoris",
  "feed",
  "favicon.ico",
  "identite",
  "icon",
  "influenceuses-tendances",
  "inscription",
  "mentions-legales",
  "models",
  "most-liked",
  "pour-toi",
  "premium",
  "qu-est-ce-que-lumengallery",
  "recherche",
  "robots.txt",
  "sitemap.xml",
  "sitemaps",
  "tiktok",
  "trending-medias",
  "trust-and-safety",
  "welcome",
]);

export const STATIC_SITEMAP_ENTRIES = [
  { path: "/", changeFrequency: "hourly", priority: 1 },
  { path: "/models", changeFrequency: "daily", priority: 0.9 },
  { path: "/trending-medias", changeFrequency: "hourly", priority: 0.8 },
  { path: "/most-liked", changeFrequency: "daily", priority: 0.8 },
  { path: "/classements", changeFrequency: "daily", priority: 0.6 },
  { path: "/influenceuses-tendances", changeFrequency: "daily", priority: 0.6 },
  { path: "/about", changeFrequency: "monthly", priority: 0.3 },
  { path: "/dmca", changeFrequency: "monthly", priority: 0.3 },
  { path: "/trust-and-safety", changeFrequency: "monthly", priority: 0.3 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.3 },
  { path: "/conditions", changeFrequency: "monthly", priority: 0.2 },
  { path: "/confidentialite", changeFrequency: "monthly", priority: 0.2 },
  { path: "/mentions-legales", changeFrequency: "monthly", priority: 0.2 },
  { path: "/qu-est-ce-que-lumengallery", changeFrequency: "monthly", priority: 0.3 },
] as const;

export const STATIC_SITEMAP_PATHS = STATIC_SITEMAP_ENTRIES.map(
  ({ path }) => path,
);

export const FUNCTIONAL_NOINDEX_PATHS = [
  "/tiktok",
  "/feed",
  "/pour-toi",
  "/random/medias",
  "/recherche",
  "/connexion",
  "/inscription",
  "/identite",
  "/favoris",
  "/premium",
  "/abonnements",
  "/add",
  "/welcome",
] as const;

export function safeDecodePathSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function shouldCanonicalizeRequest(
  rawHost: string,
  rawProtocol: string | null,
  canonicalHost: string,
): boolean {
  const host = rawHost
    .split(",", 1)[0]
    ?.trim()
    .replace(/:\d+$/, "")
    .toLowerCase();
  if (!host || INTERNAL_REQUEST_HOSTS.has(host)) return false;

  const expectedHost = canonicalHost.trim().toLowerCase();
  const protocol = rawProtocol?.split(",", 1)[0]?.trim().toLowerCase();
  return host !== expectedHost || protocol === "http";
}

export function isAllowedReservedTwoSegmentPath(
  firstSegment: string,
  secondSegment: string,
): boolean {
  return ALLOWED_RESERVED_TWO_SEGMENT_PATHS.has(
    `${firstSegment.toLowerCase()}/${secondSegment.toLowerCase()}`,
  );
}

export function isExistingTopLevelRoute(pathSegment: string): boolean {
  return EXISTING_TOP_LEVEL_ROUTES.has(pathSegment.toLowerCase());
}

export function normalizeTagSlug(raw: unknown): string | null {
  let candidate: unknown = raw;

  if (raw && typeof raw === "object" && "slug" in raw) {
    candidate = (raw as { slug?: unknown }).slug;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    const legacy = LEGACY_TAG_SLUG.exec(trimmed);
    candidate = legacy?.[1] ?? trimmed;
  }

  if (typeof candidate !== "string") return null;
  const slug = candidate.trim().toLowerCase();
  if (!SAFE_TAG_SLUG.test(slug) || slug.length > 80) return null;
  return slug;
}

export function legacyTagPrefix(slug: string): string | null {
  const normalized = normalizeTagSlug(slug);
  return normalized ? `{'slug': '${normalized}',%` : null;
}

export function mediaSitemapFileCount(totalIndexableMedia: number): number {
  const total = Math.max(0, Math.floor(Number(totalIndexableMedia) || 0));
  if (total === 0) return 0;
  return Math.min(
    MAX_MEDIA_SITEMAP_FILES,
    Math.ceil(total / MEDIA_SITEMAP_CHUNK_SIZE),
  );
}

/**
 * Version 1 is canonical only without a suffix. Versions >1 are canonical only
 * with their exact `-vN` suffix. Every other spelling is a duplicate URL.
 */
export function isCurrentMediaVersion(
  entityVersion: number | null | undefined,
  requestedVersion: number | null,
): boolean {
  const parsed = Number(entityVersion ?? 1);
  const current = Number.isInteger(parsed) && parsed > 1 ? parsed : 1;
  return current === 1
    ? requestedVersion == null
    : requestedVersion === current;
}

export const isCurrentPublicVersion = isCurrentMediaVersion;

export function canonicalForStaticPath(path: string): string | null {
  return (STATIC_SITEMAP_PATHS as readonly string[]).includes(path) ? path : null;
}

export type CreatorSearchParams = Record<string, string | string[] | undefined>;

/** Only the three exact legacy queries identify an equivalent clean collection. */
export function legacyCreatorCollection(search: CreatorSearchParams): "photos" | "videos" | "popular" | null {
  const keys = Object.keys(search).filter((key) => search[key] !== undefined);
  if (keys.length !== 1) return null;
  if (search.type === "photo") return "photos";
  if (search.type === "video") return "videos";
  if (search.sort === "popular") return "popular";
  return null;
}

/** Every extra filter is functional, but only numbered clean pages are indexable. */
export function isCleanCreatorQuery(search: CreatorSearchParams): boolean {
  return Object.keys(search).every((key) => key === "page" || search[key] === undefined);
}
