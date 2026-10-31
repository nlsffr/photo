import assert from "node:assert/strict";
import test from "node:test";

async function config() {
  // @ts-expect-error Native Node requires explicit suffixes.
  return import("../src/lib/i18n/config.ts");
}

test("all seven content locales dispatch creators, collections and media without expanding functional pages", async () => {
  const { LOCALES, resolveLocalizedPage, localesForPath } = await config();
  for (const locale of LOCALES) {
    assert.deepEqual(resolveLocalizedPage(locale, "/aria-lune-v3"), { kind: "creator", handle: "aria-lune-v3", collection: "overview" });
    assert.deepEqual(resolveLocalizedPage(locale, "/aria-lune-v3/photos"), { kind: "creator", handle: "aria-lune-v3", collection: "photos" });
    assert.deepEqual(resolveLocalizedPage(locale, "/aria-lune/123-v2"), { kind: "media", handle: "aria-lune", id: "123-v2" });
    assert.deepEqual(resolveLocalizedPage(locale, "/aria-lune/db-media-id"), { kind: "media", handle: "aria-lune", id: "db-media-id" });
    assert.deepEqual(localesForPath("/aria-lune/123-v2"), LOCALES);
  }
  for (const locale of ["es", "de", "it", "pt", "nl"] as const) {
    assert.equal(resolveLocalizedPage(locale, "/about"), null);
    assert.equal(resolveLocalizedPage(locale, "/contact/support"), null);
    assert.deepEqual(localesForPath("/contact/support"), ["en", "fr"]);
  }
});

test("content links switch languages while retaining version, collection, pagination and query fragments", async () => {
  const { localizedHref, switchLocalePath, localeRedirectTarget } = await config();
  assert.equal(localizedHref("de", "/aria-lune-v3/photos?page=2#items"), "/de/aria-lune-v3/photos?page=2#items");
  assert.equal(localizedHref("es", "/aria-lune/123-v2"), "/es/aria-lune/123-v2");
  assert.equal(localizedHref("fr", "/de/aria-lune/123-v2?from=related"), "/fr/aria-lune/123-v2?from=related");
  assert.equal(switchLocalePath("/fr/aria-lune-v3/photos", "it"), "/it/aria-lune-v3/photos");
  assert.equal(switchLocalePath("/aria-lune/123-v2", "nl"), "/nl/aria-lune/123-v2");
  assert.equal(localizedHref("de", "/contact/support"), "/en/contact/support");
  // Existing bare content remains the neutral route instead of a language redirect.
  assert.equal(localeRedirectTarget("/aria-lune/123-v2", "fr", "de"), null);
  assert.equal(localeRedirectTarget("/aria-lune-v3", "fr", "de"), null);
});

test("content locale routing rejects malformed segments, reserved namespaces and nested locale prefixes", async () => {
  const { LOCALES, resolveLocalizedPage } = await config();
  for (const locale of LOCALES) for (const path of [
    "/aria-lune//123", "/aria-lune/photos/extra", "/en/aria-lune", "/de/aria-lune/123",
    "/api/123", "/media/123", "/models/123", "/aria%2Flune/123", "/aria-lune/123%2F456",
    "/aria-lune/%E0%A4%A", "/aria-lune/.", "/aria-lune/..", "/aria-lune/123?bad", "/aria-lune/123#bad",
  ]) assert.equal(resolveLocalizedPage(locale, path), null, `${locale}${path}`);
});

test("creator metadata and path helpers preserve reciprocal seven-language versioned collection pages", async () => {
  // @ts-expect-error Native Node requires explicit suffixes.
  const { creatorCollectionAlternates } = await import("../src/lib/i18n/metadata.ts");
  // @ts-expect-error Native Node requires explicit suffixes.
  const { creatorCollectionPath, parseCreatorCollectionPath } = await import("../src/lib/creator-collections.ts");
  const { LOCALES } = await config();
  const languages = {
    en: "/en/aria-lune-v3/videos?page=2", fr: "/fr/aria-lune-v3/videos?page=2",
    es: "/es/aria-lune-v3/videos?page=2", de: "/de/aria-lune-v3/videos?page=2",
    it: "/it/aria-lune-v3/videos?page=2", pt: "/pt/aria-lune-v3/videos?page=2",
    nl: "/nl/aria-lune-v3/videos?page=2", "x-default": "/aria-lune-v3/videos?page=2",
  };
  for (const locale of LOCALES) {
    assert.equal(creatorCollectionPath("aria-lune", 3, "videos", locale, 2), `/${locale}/aria-lune-v3/videos?page=2`);
    assert.deepEqual(parseCreatorCollectionPath(`/${locale}/aria-lune-v3/videos`), { handle: "aria-lune-v3", collection: "videos" });
    const metadata = creatorCollectionAlternates("aria-lune", 3, "videos", locale, 2);
    assert.equal(metadata.canonical, `/${locale}/aria-lune-v3/videos?page=2`);
    assert.deepEqual(metadata.languages, languages);
  }
  assert.deepEqual(creatorCollectionAlternates("aria-lune", 3, "videos", undefined, 2).languages, languages);
});
