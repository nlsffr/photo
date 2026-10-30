import assert from "node:assert/strict";
import test from "node:test";

async function loadConfig() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/i18n/config.ts");
}

test("supports seven discovery locales while creator routes stay English and French", async () => {
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
  assert.deepEqual(CREATOR_LOCALES, ["en", "fr"]);
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
  assert.equal(isCreatorLocale("es"), false);

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
  assert.equal(resolveLocalizedPage("es", "/aria-lune-v3"), null);
});

test("prefix and strip helpers preserve one equivalent public path", async () => {
  const { localizedHref, localePath, stripLocalePrefix, switchLocalePath } =
    await loadConfig();

  assert.equal(localePath("en", "/"), "/en");
  assert.equal(localePath("fr", "/models"), "/fr/models");
  assert.deepEqual(stripLocalePrefix("/fr/trending-medias"), {
    locale: "fr",
    pathname: "/trending-medias",
  });
  assert.deepEqual(stripLocalePrefix("/nl/trending-medias"), {
    locale: "nl",
    pathname: "/trending-medias",
  });
  assert.deepEqual(stripLocalePrefix("/models"), {
    locale: null,
    pathname: "/models",
  });
  assert.equal(switchLocalePath("/en/models", "fr"), "/fr/models");
  assert.equal(switchLocalePath("/en/models", "de"), "/de/models");
  assert.equal(switchLocalePath("/fr/about", "de"), "/en/about");
  assert.equal(switchLocalePath("/fr/aria-lune-v3", "de"), "/en/aria-lune-v3");
  assert.equal(switchLocalePath("/fr", "en"), "/en");
  assert.equal(
    localizedHref("fr", "/connexion?next=/abonnements#form"),
    "/fr/connexion?next=/abonnements#form",
  );
  assert.equal(localizedHref("fr", "/creator-name"), "/creator-name");
  assert.equal(localizedHref("es", "/models"), "/es/models");
  assert.equal(localizedHref("es", "/about"), "/en/about");
});

test("locale alternates are reciprocal and expose a neutral selector URL", async () => {
  const { localeAlternates } = await loadConfig();

  assert.deepEqual(localeAlternates("/models"), {
    en: "/en/models",
    fr: "/fr/models",
    es: "/es/models",
    de: "/de/models",
    it: "/it/models",
    pt: "/pt/models",
    nl: "/nl/models",
    "x-default": "/models",
  });
  assert.deepEqual(localeAlternates("/about"), {
    en: "/en/about",
    fr: "/fr/about",
    "x-default": "/about",
  });
  assert.deepEqual(localeAlternates("/aria-lune-v3/photos"), {
    en: "/en/aria-lune-v3/photos",
    fr: "/fr/aria-lune-v3/photos",
    "x-default": "/aria-lune-v3/photos",
  });
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
