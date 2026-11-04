// @ts-expect-error Native Node requires explicit suffixes.
import { LOCALES as ACTIVE_LOCALES } from "../src/lib/i18n/config.ts";
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

test("discovery metadata has a self canonical and reciprocal language URLs", async () => {
  const { buildLocalizedMetadata } = await loadMetadata();

  const english = buildLocalizedMetadata("en", "/models", {
    title: "Models",
    description: "Browse creators",
  });
  const french = buildLocalizedMetadata("fr", "/models", {
    title: "Modèles",
    description: "Parcourir les créateurs",
  });

  const languages = { ...Object.fromEntries(ACTIVE_LOCALES.map(locale => [locale, `${locale === "en" ? "" : `/${locale}`}/models`])), "x-default": "/models" };
  assert.deepEqual(english.alternates, { canonical: "/models", languages });
  assert.deepEqual(french.alternates, { canonical: "/fr/models", languages });
  assert.equal(english.openGraph?.url, "/models");
  assert.equal(french.openGraph?.url, "/fr/models");
  assert.equal(english.openGraph?.locale, "en_US");
  assert.equal(french.openGraph?.locale, "fr_FR");
});

test("all discovery languages have stable canonicals without changing localized copy or Open Graph locales", async () => {
  const { buildLocalizedMetadata } = await loadMetadata();
  const { getDictionary } = await loadDictionaries();
  const pages = [
    ["/", "home"], ["/models", "models"], ["/trending-medias", "trending"],
    ["/most-liked", "mostLiked"], ["/classements", "rankings"],
    ["/influenceuses-tendances", "influencers"],
  ] as const;
  const ogLocales = { es: "es_ES", de: "de_DE", it: "it_IT", pt: "pt_PT", nl: "nl_NL", ru: "ru_RU", zh: "zh_CN", ja: "ja_JP", hi: "hi_IN", th: "th_TH" };
  for (const locale of ACTIVE_LOCALES.filter(locale => locale !== "en" && locale !== "fr")) {
    for (const [path, key] of pages) {
      const copy = getDictionary(locale).pages[key].meta;
      const metadata = buildLocalizedMetadata(locale, path, copy);
      const canonical = `/${locale}${path === "/" ? "" : path}`;
      assert.equal(metadata.alternates?.canonical, canonical);
      assert.equal(metadata.alternates?.languages?.[locale], canonical);
      assert.equal(metadata.alternates?.languages?.["x-default"], path);
      assert.equal(Object.keys(metadata.alternates?.languages ?? {}).length, 13);
      assert.equal(metadata.openGraph?.url, canonical);
      assert.equal(metadata.openGraph?.locale, ogLocales[locale]);
      assert.equal(metadata.openGraph?.alternateLocale?.length, 11);
      assert.notEqual(copy.description, getDictionary("en").pages[key].meta.description);
    }
  }
  const editorial = buildLocalizedMetadata("fr", "/about", getDictionary("fr").pages.about.meta);
  assert.deepEqual(editorial.alternates, { canonical: "/about" });
  const fallback = buildLocalizedMetadata("es", "/about", getDictionary("en").pages.about.meta);
  assert.deepEqual(fallback.alternates, { canonical: "/about" });
  assert.equal(fallback.openGraph?.locale, "en_US");
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

test("creator metadata preserves collection, version and numbered page on the single canonical", async () => {
  // @ts-expect-error Native Node requires explicit suffixes.
  const { loadAppModule } = await import("./helpers/load-app-module.ts");
  const replacements: Record<string, unknown> = {
    "@/lib/photos": { getCreatorCollectionContext: async () => ({ creator: { handle: "aria", name: "Aria", urlVersion: 3 }, stats: { mediaCount: 100, photoCount: 70, videoCount: 30, engagedCount: 10 } }) },
  };
  for (const [file, name] of [["InfiniteGallery", "InfiniteGallery"], ["VerifiedBadge", "VerifiedBadge"], ["Interactions", "FollowButton"], ["MediaImg", "MediaImg"], ["BackLink", "BackLink"], ["FloatingBack", "FloatingBack"], ["JsonLd", "JsonLd"]]) replacements[`@/components/${file}`] = { [name]: () => null };
  const renderer = loadAppModule<{ creatorCollectionMetadata: (props: Record<string, unknown>) => Promise<import("next").Metadata> }>("src/features/creator/CreatorCollectionPage.tsx", replacements);
  for (const collection of ["overview", "photos", "videos", "popular"]) for (const page of [1, 2]) {
    const path = `/aria-v3${collection === "overview" ? "" : `/${collection}`}${page > 1 ? `?page=${page}` : ""}`;
    const metadata = await renderer.creatorCollectionMetadata({ handleParam: "aria-v3", collection, searchParams: { page: String(page) } });
    assert.equal(metadata.alternates?.canonical, path);
    assert.equal(metadata.alternates?.languages, undefined);
  }
});


test("retired media prefixes never escape into a canonical, including the media version", async () => {
  const { mediaPageAlternates } = await loadMetadata();
  for (const locale of ACTIVE_LOCALES) {
    assert.deepEqual(mediaPageAlternates(`/${locale}/aria/123-v4`, locale), { canonical: "/aria/123-v4" });
  }
});
