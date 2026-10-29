import assert from "node:assert/strict";
import test from "node:test";

async function loadConfig() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/i18n/config.ts");
}

test("supports only the two server-rendered locales", async () => {
  const { DEFAULT_LOCALE, LOCALES, isLocale } = await loadConfig();

  assert.deepEqual(LOCALES, ["en", "fr"]);
  assert.equal(DEFAULT_LOCALE, "en");
  assert.equal(isLocale("fr"), true);
  assert.equal(isLocale("es"), false);
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
  assert.deepEqual(stripLocalePrefix("/models"), {
    locale: null,
    pathname: "/models",
  });
  assert.equal(switchLocalePath("/en/models", "fr"), "/fr/models");
  assert.equal(switchLocalePath("/fr", "en"), "/en");
  assert.equal(
    localizedHref("fr", "/connexion?next=/abonnements#form"),
    "/fr/connexion?next=/abonnements#form",
  );
  assert.equal(localizedHref("fr", "/creator-name"), "/creator-name");
});

test("locale alternates are reciprocal and expose a neutral selector URL", async () => {
  const { localeAlternates } = await loadConfig();

  assert.deepEqual(localeAlternates("/models"), {
    en: "/en/models",
    fr: "/fr/models",
    "x-default": "/models",
  });
});

test("the locale cookie wins, then Accept-Language quality values, then English", async () => {
  const { chooseLocale } = await loadConfig();

  assert.equal(chooseLocale("en", "fr-FR,fr;q=0.9,en;q=0.8"), "en");
  assert.equal(chooseLocale(null, "de;q=0.9,fr-FR;q=0.8,en;q=0.7"), "fr");
  assert.equal(chooseLocale(null, "fr;q=0.4,en-GB;q=0.9"), "en");
  assert.equal(chooseLocale("invalid", "es-MX,es;q=0.9"), "en");
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
