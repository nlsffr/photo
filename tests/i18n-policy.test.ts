import assert from "node:assert/strict";
import test from "node:test";

async function loadConfig() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/i18n/config.ts");
}

test("supports seven discovery and content locales while editorial routes stay English and French", async () => {
  const {
    CREATOR_LOCALES,
    DEFAULT_LOCALE,
    DISCOVERY_ROUTE_PATHS,
    LOCALES,
    isCreatorLocale,
    isLocale,
    resolveLocalizedPage,
  } = await loadConfig();

  assert.deepEqual(LOCALES, ["en", "fr", "es", "de", "it", "pt", "nl"]);
  assert.deepEqual(CREATOR_LOCALES, ["en", "fr", "es", "de", "it", "pt", "nl"]);
  assert.deepEqual(DISCOVERY_ROUTE_PATHS, [
    "/",
    "/models",
    "/trending-medias",
    "/most-liked",
    "/classements",
    "/influenceuses-tendances",
  ]);
  assert.equal(DEFAULT_LOCALE, "en");
  assert.equal(isLocale("fr"), true);
  assert.equal(isLocale("es"), true);
  assert.equal(isLocale("pl"), false);
  assert.equal(isCreatorLocale("fr"), true);
  assert.equal(isCreatorLocale("es"), true);

  for (const locale of LOCALES) {
    for (const pathname of DISCOVERY_ROUTE_PATHS) {
      assert.deepEqual(resolveLocalizedPage(locale, pathname), {
        kind: "static",
        pathname,
      });
    }
  }

  assert.deepEqual(resolveLocalizedPage("fr", "/about"), {
    kind: "static",
    pathname: "/about",
  });
  assert.equal(resolveLocalizedPage("es", "/about"), null);
  assert.deepEqual(resolveLocalizedPage("en", "/aria-lune-v3"), {
    kind: "creator",
    handle: "aria-lune-v3",
    collection: "overview",
  });
  assert.deepEqual(resolveLocalizedPage("es", "/aria-lune-v3"), {
    kind: "creator", handle: "aria-lune-v3", collection: "overview",
  });
});

test("public helpers localize discoveries and keep content bare while preserving query and fragments", async () => {
  const { localizedHref, localePath, internalLocalePath, stripLocalePrefix, switchLocalePath } = await loadConfig();
  for (const locale of ["en", "fr", "es", "de", "it", "pt", "nl"] as const) {
    assert.equal(localePath(locale, "/"), locale === "en" ? "/" : `/${locale}`);
    assert.equal(localePath(locale, "/fr/models?page=2#items"), `${locale === "en" ? "" : `/${locale}`}/models?page=2#items`);
    assert.equal(localizedHref(locale, "/fr/aria-lune/123-v2?from=related#photo"), "/aria-lune/123-v2?from=related#photo");
    assert.equal(switchLocalePath("/en/models?page=2#items", locale), `${locale === "en" ? "" : `/${locale}`}/models?page=2#items`);
    assert.equal(internalLocalePath(locale, "/models?page=2#items"), `/${locale}/models?page=2#items`);
    assert.equal(internalLocalePath(locale, "/"), `/${locale}`);
  }
  assert.deepEqual(stripLocalePrefix("/nl/trending-medias"), { locale: "nl", pathname: "/trending-medias" });
  for (const href of ["https://example.com/models?x=1#item", "//example.com/models", "mailto:a@example.com", "tel:+33123456789", "#items", "?page=2", "/api/photos?cursor=2", "/api/photos/", "/media/folder/?x=1#items", "/media/preview.jpg", "/_next/static/app.js"]) {
    assert.equal(localizedHref("fr", href), href, href);
  }
});

test("only discoveries expose reciprocal hreflang URL alternatives", async () => {
  const { localeAlternates } = await loadConfig();
  assert.deepEqual(localeAlternates("/models"), { en: "/models", fr: "/fr/models", es: "/es/models", de: "/de/models", it: "/it/models", pt: "/pt/models", nl: "/nl/models", "x-default": "/models" });
  for (const path of ["/about", "/aria-lune-v3/photos"]) assert.deepEqual(localeAlternates(path), {});
});

test("the locale cookie wins, then Accept-Language quality values, then English", async () => {
  const { chooseLocale, defaultShellLocale } = await loadConfig();

  assert.equal(chooseLocale("en", "fr-FR,fr;q=0.9,en;q=0.8"), "en");
  assert.equal(chooseLocale(null, "de;q=0.9,fr-FR;q=0.8,en;q=0.7"), "de");
  assert.equal(chooseLocale(null, "fr;q=0.4,en-GB;q=0.9"), "en");
  assert.equal(chooseLocale("invalid", "es-MX,es;q=0.9"), "es");
  assert.equal(defaultShellLocale("fr"), "fr");
  assert.equal(defaultShellLocale("nl"), "nl");
  assert.equal(defaultShellLocale("invalid"), "en");
});

test("framework, API, asset, bot and sitemap URLs never enter locale routing", async () => {
  const { isSystemPath } = await loadConfig();

  for (const pathname of [
    "/api/photos",
    "/_next/static/chunk.js",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/sitemaps/media/0",
    "/icon",
    "/apple-icon",
    "/media/poster.webp",
  ]) {
    assert.equal(isSystemPath(pathname), true, pathname);
  }
  assert.equal(isSystemPath("/models"), false);
});
