import assert from "node:assert/strict";
import test from "node:test";

async function loadMetadata() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/i18n/metadata.ts");
}

async function loadDictionaries() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/i18n/dictionaries.ts");
}

test("localized metadata self-canonicalizes with reciprocal hreflang and x-default", async () => {
  const { buildLocalizedMetadata } = await loadMetadata();

  const english = buildLocalizedMetadata("en", "/models", {
    title: "Models",
    description: "Browse creators",
  });
  const french = buildLocalizedMetadata("fr", "/models", {
    title: "Modèles",
    description: "Parcourir les créateurs",
  });

  assert.equal(english.alternates?.canonical, "/en/models");
  assert.deepEqual(english.alternates?.languages, {
    en: "/en/models",
    fr: "/fr/models",
    "x-default": "/models",
  });
  assert.equal(french.alternates?.canonical, "/fr/models");
  assert.deepEqual(french.alternates?.languages, english.alternates?.languages);
  assert.equal(english.openGraph?.locale, "en_US");
  assert.equal(french.openGraph?.locale, "fr_FR");
});

test("the two server dictionaries translate primary UI and indexable metadata", async () => {
  const { getDictionary } = await loadDictionaries();
  const en = getDictionary("en");
  const fr = getDictionary("fr");

  assert.equal(en.shell.navigation.home, "Home");
  assert.equal(fr.shell.navigation.home, "Accueil");
  assert.notEqual(en.home.filters.all, fr.home.filters.all);
  assert.notEqual(en.auth.loginTitle, fr.auth.loginTitle);
  assert.notEqual(en.premium.choosePlan, fr.premium.choosePlan);
  assert.notEqual(en.search.title, fr.search.title);
  assert.notEqual(en.searchForm.advanced, fr.searchForm.advanced);
  assert.notEqual(en.addMedia.title, fr.addMedia.title);
  assert.notEqual(en.addMedia.chooseFile, fr.addMedia.chooseFile);
  assert.notEqual(en.pages.models.meta.description, fr.pages.models.meta.description);
  assert.notEqual(en.pages.terms.meta.title, fr.pages.terms.meta.title);
});
