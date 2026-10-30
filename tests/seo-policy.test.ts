import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

async function loadPolicy() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/seo-policy.ts");
}

async function loadAsyncTtlCache() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/async-ttl-cache.ts");
}

test("coalesces concurrent sitemap loads and reuses the cached value", async () => {
  const { createAsyncTtlCache } = await loadAsyncTtlCache();
  let now = 1_000;
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const load = createAsyncTtlCache(
    async () => {
      calls += 1;
      await gate;
      return calls;
    },
    100,
    () => now,
  );

  const first = load();
  const second = load();
  assert.equal(calls, 1, "parallel callers must share one database load");
  release();
  assert.deepEqual(await Promise.all([first, second]), [1, 1]);
  assert.equal(await load(), 1, "the fresh value must be served from memory");
  now = 1_101;
  assert.equal(await load(), 2, "an expired value must be refreshed");
});

test("coalesces async cache loads independently for each key", async () => {
  const { createAsyncTtlCacheMap } = await loadAsyncTtlCache();
  let now = 1_000;
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const load = createAsyncTtlCacheMap(
    async (key: string) => {
      const invocation = ++calls;
      await gate;
      return `${key}:${invocation}`;
    },
    100,
    () => now,
  );

  const firstA = load("a");
  const secondA = load("a");
  const firstB = load("b");
  assert.equal(calls, 2, "same-key callers share one load; other keys do not");
  release();
  assert.deepEqual(await Promise.all([firstA, secondA, firstB]), [
    "a:1",
    "a:1",
    "b:2",
  ]);
  assert.equal(await load("a"), "a:1");
  now = 1_101;
  assert.equal(await load("a"), "a:3");
});

test("retries a keyed async cache load after a rejection", async () => {
  const { createAsyncTtlCacheMap } = await loadAsyncTtlCache();
  let calls = 0;
  const load = createAsyncTtlCacheMap(async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary failure");
    return calls;
  }, 1_000);

  await assert.rejects(load("models"), /temporary failure/);
  assert.equal(await load("models"), 2);
});

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

test("reserves every static, technical, collection, locale, and asset creator handle", async () => {
  const { isReservedCreatorHandle } = await loadPolicy();

  for (const handle of [
    "models", "api", "creator", "photo", "media", "_next", "saved", "liked",
    "search", "random", "tag", "photos", "videos", "popular", "en", "fr",
    "favicon.svg", "file.svg", "google652c2e22ed1e9315.html",
  ]) {
    assert.equal(isReservedCreatorHandle(handle), true, handle);
    assert.equal(isReservedCreatorHandle(handle.toUpperCase()), true, handle.toUpperCase());
  }
  for (const handle of ["alice", "tina_kitsune", "little.warren", "emiru.jpg", "alice-V2"]) {
    assert.equal(isReservedCreatorHandle(handle), false, handle);
  }
  for (const asset of await readdir(new URL("../public", import.meta.url))) {
    assert.equal(isReservedCreatorHandle(asset), true, `public/${asset}`);
  }
});

test("uses conservative media chunks without truncating the catalog", async () => {
  const { MAX_MEDIA_SITEMAP_FILES, mediaSitemapFileCount } = await loadPolicy();

  assert.equal(MAX_MEDIA_SITEMAP_FILES, 49_741);
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
