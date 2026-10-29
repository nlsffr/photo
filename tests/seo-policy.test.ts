import assert from "node:assert/strict";
import test from "node:test";

async function loadPolicy() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/seo-policy.ts");
}

test("normalizes legacy Python-dict tags to one safe public slug", async () => {
  const { normalizeTagSlug } = await loadPolicy();

  assert.equal(
    normalizeTagSlug("{'slug': 'curvy', 'family': 'body'}"),
    "curvy",
  );
  assert.equal(normalizeTagSlug("long-hair"), "long-hair");
  assert.equal(normalizeTagSlug("{'family': 'body'}"), null);
  assert.equal(normalizeTagSlug("../../private"), null);
  assert.equal(normalizeTagSlug(""), null);
});

test("rejects malformed percent-encoded path segments without throwing", async () => {
  const { safeDecodePathSegment } = await loadPolicy();

  assert.equal(safeDecodePathSegment("valid%20profile"), "valid profile");
  assert.equal(safeDecodePathSegment("%E0%A4%A"), null);
});

test("canonicalizes every external host and protocol variant", async () => {
  const { shouldCanonicalizeRequest } = await loadPolicy();

  assert.equal(
    shouldCanonicalizeRequest("www.leakfanhub.com", "https", "leakfanhub.com"),
    true,
  );
  assert.equal(
    shouldCanonicalizeRequest("77.73.70.23", "http", "leakfanhub.com"),
    true,
  );
  assert.equal(
    shouldCanonicalizeRequest("unknown.example", "https", "leakfanhub.com"),
    true,
  );
  assert.equal(
    shouldCanonicalizeRequest("leakfanhub.com", "http", "leakfanhub.com"),
    true,
  );
  assert.equal(
    shouldCanonicalizeRequest("leakfanhub.com", "https", "leakfanhub.com"),
    false,
  );
  assert.equal(
    shouldCanonicalizeRequest("localhost:3000", "http", "leakfanhub.com"),
    false,
  );
  assert.equal(
    shouldCanonicalizeRequest("photo-seo-candidate", null, "leakfanhub.com"),
    false,
  );
});

test("allows only real reserved two-segment routes", async () => {
  const { isAllowedReservedTwoSegmentPath } = await loadPolicy();

  assert.equal(isAllowedReservedTwoSegmentPath("contact", "support"), true);
  assert.equal(isAllowedReservedTwoSegmentPath("random", "medias"), true);
  assert.equal(isAllowedReservedTwoSegmentPath("sitemaps", "tags"), true);
  assert.equal(isAllowedReservedTwoSegmentPath("models", "missing"), false);
  assert.equal(isAllowedReservedTwoSegmentPath("feed", "missing"), false);
  assert.equal(isAllowedReservedTwoSegmentPath("sitemaps", "unknown"), false);
});

test("distinguishes real top-level pages from route namespaces", async () => {
  const { isExistingTopLevelRoute } = await loadPolicy();

  for (const path of ["models", "feed", "contact", "sitemaps", "icon"]) {
    assert.equal(isExistingTopLevelRoute(path), true, `${path} exists`);
  }
  for (const path of [
    "creator",
    "photo",
    "media",
    "random",
    "tag",
    "search",
    "saved",
    "liked",
  ]) {
    assert.equal(isExistingTopLevelRoute(path), false, `${path} is a namespace`);
  }
});

test("computes every media sitemap chunk without the old 40-file cap", async () => {
  const { mediaSitemapFileCount } = await loadPolicy();

  assert.equal(mediaSitemapFileCount(0), 0);
  assert.equal(mediaSitemapFileCount(1), 1);
  assert.equal(mediaSitemapFileCount(80_001), 41);
  assert.equal(mediaSitemapFileCount(226_676), 114);
});

test("accepts only the canonical database URL version for a media item", async () => {
  const { isCurrentMediaVersion } = await loadPolicy();

  assert.equal(isCurrentMediaVersion(1, null), true, "v1 uses the bare URL");
  assert.equal(isCurrentMediaVersion(1, 1), false, "-v1 is a duplicate");
  assert.equal(isCurrentMediaVersion(1, 2), false);
  assert.equal(isCurrentMediaVersion(2, null), false, "v2 no longer uses the bare URL");
  assert.equal(isCurrentMediaVersion(2, 1), false);
  assert.equal(isCurrentMediaVersion(2, 2), true);
  assert.equal(isCurrentMediaVersion(2, 999), false);
});

test("keeps only indexable content pages in the static sitemap", async () => {
  const {
    STATIC_SITEMAP_PATHS,
    FUNCTIONAL_NOINDEX_PATHS,
    canonicalForStaticPath,
  } = await loadPolicy();

  const sitemapPaths = new Set<string>(STATIC_SITEMAP_PATHS);
  const noindexPaths = FUNCTIONAL_NOINDEX_PATHS as readonly string[];
  for (const path of [
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
    "/conditions",
    "/confidentialite",
    "/mentions-legales",
    "/qu-est-ce-que-lumengallery",
  ]) {
    assert.equal(sitemapPaths.has(path), true, `${path} should be submitted`);
    assert.equal(canonicalForStaticPath(path), path, `${path} must self-canonicalize`);
  }

  for (const path of [
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
  ]) {
    assert.equal(sitemapPaths.has(path), false, `${path} must not be submitted`);
    assert.equal(
      noindexPaths.includes(path),
      true,
      `${path} must be crawlable but noindex`,
    );
  }
});
