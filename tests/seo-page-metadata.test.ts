import assert from "node:assert/strict";
import test from "node:test";
import type { Metadata } from "next";
import type { SeoEditorEntry, SeoLocale, SeoPageKey } from "../src/lib/seo-editor-contract";
// @ts-expect-error Native Node requires explicit suffixes.
import { SEO_LANGUAGES, SEO_PAGES } from "../src/lib/seo-editor-contract.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Helpers = {
  applyStoredSeoMetadata(metadata: Metadata, override: SeoEditorEntry | null): Metadata;
  applySeoPageMetadata(metadata: Metadata, locale: SeoLocale, page: SeoPageKey): Promise<Metadata>;
};

const saved: SeoEditorEntry = {
  page: "models", locale: "fr", title: 'Exact <titre> "é" & texte',
  description: 'Description <script> & "caractères" sans double encodage',
  revision: 3, updatedAt: "2026-11-01T00:00:00Z", source: "saved",
};

function assertOverride(metadata: Metadata) {
  assert.deepEqual(metadata.title, { absolute: saved.title });
  assert.equal(metadata.description, saved.description);
  assert.equal(metadata.openGraph?.title, saved.title);
  assert.equal(metadata.openGraph?.description, saved.description);
  assert.equal(metadata.twitter?.title, saved.title);
  assert.equal(metadata.twitter?.description, saved.description);
}

test("saved page metadata uses the exact text on all four surfaces and preserves other fields", async () => {
  const reads: unknown[][] = [];
  const helper = loadAppModule<Helpers>("src/lib/seo-page-metadata.ts", {
    "./seo-editor-store": { readSeoOverride: async (...args: unknown[]) => { reads.push(args); return saved; } },
  });
  const base: Metadata = {
    title: { default: "Default", template: "%s | Inherited" }, description: "Default description",
    alternates: { canonical: "/fr/models?sort=views&page=3", languages: { fr: "/fr/models?sort=views&page=3" } },
    robots: { index: false, follow: true },
    openGraph: { type: "website", title: "Default", images: ["/fixture.jpg"], url: "/fr/models?sort=views&page=3", locale: "fr_FR" },
    twitter: { card: "summary_large_image", site: "@fixture", images: ["/fixture.jpg"] },
    icons: { icon: "/icon.svg" },
  };
  const before = structuredClone(base);
  const result = await helper.applySeoPageMetadata(base, "fr", "models");
  assertOverride(result);
  assert.deepEqual(reads, [["fr", "models"]]);
  assert.deepEqual(base, before);
  assert.strictEqual(result.alternates, base.alternates);
  assert.strictEqual(result.robots, base.robots);
  assert.strictEqual(result.icons, base.icons);
  assert.deepEqual(result.openGraph, { ...base.openGraph, title: saved.title, description: saved.description });
  assert.deepEqual(result.twitter, { ...base.twitter, title: saved.title, description: saved.description });
  assert.strictEqual(helper.applyStoredSeoMetadata(base, null), base);
});

test("no saved page entry returns the original metadata object without adding fields", async () => {
  const helper = loadAppModule<Helpers>("src/lib/seo-page-metadata.ts", {
    "./seo-editor-store": { readSeoOverride: async () => null },
  });
  const base: Metadata = { title: "Default", alternates: { canonical: "/" } };
  assert.strictEqual(await helper.applySeoPageMetadata(base, "en", "home"), base);
});

type Search = Record<string, string>;
type Route = { metadata?: Metadata; generateMetadata?: (props: { searchParams: Promise<Search> }) => Promise<Metadata> };
type Localized = { localizedPageMetadata(locale: SeoLocale, path: string, search: Promise<Search>): Promise<Metadata> };

test("all six bare and twelve-language discovery routes apply saved text without changing routing or indexing", async () => {
  let override: SeoEditorEntry | null = null;
  const reads: Array<[SeoLocale, SeoPageKey]> = [];
  const replacements: Record<string, unknown> = {
    "./seo-editor-store": { readSeoOverride: async (locale: SeoLocale, page: SeoPageKey) => { reads.push([locale, page]); return override; } },
    "@/lib/photos": {},
    "@/features/creator/CreatorCollectionPage": {},
    "@/features/media/MediaDetailPage": {},
  };
  for (const name of ["AdSlot", "AuthForm", "ContactForm", "CreatorCard", "FeaturedCreators", "FollowingFeed", "ForYouGallery", "HomeFilters", "InfiniteGallery", "JsonLd", "LegalPage", "MediaImg", "ModelsGrid", "SavedGallery", "VerifiedBadge"]) {
    replacements[`@/components/${name}`] = { [name]: () => null };
  }
  for (const path of ["add", "feed", "premium", "recherche", "about", "conditions", "confidentialite", "contact", "dmca", "mentions-legales", "qu-est-ce-que-lumengallery", "trust-and-safety", "contact/support", "contact/signalement", "contact/partenariats", "contact/presse"]) {
    replacements[`@/app/(default)/${path}/page`] = { __esModule: true, default: () => null };
  }
  const localized = loadAppModule<Localized>("src/features/i18n/LocalizedPage.tsx", replacements);
  const search = { sort: "views", page: "3" };
  for (const { key, path } of SEO_PAGES) {
    const route = loadAppModule<Route>(`src/app/(default)${path === "/" ? "" : path}/page.tsx`, replacements);
    assert.equal(typeof route.generateMetadata, "function", `${key} needs dynamic saved metadata`);
    assert.equal(route.metadata, undefined, "Next forbids static metadata alongside generateMetadata");
    for (const locale of [null, ...SEO_LANGUAGES.map((entry) => entry.code)]) {
      const read = () => locale
        ? localized.localizedPageMetadata(locale, path, Promise.resolve(search))
        : route.generateMetadata!({ searchParams: Promise.resolve(search) });
      override = null;
      const baseline = await read();
      if (key === "home") {
        assert.equal((baseline.openGraph as { type?: string })?.type, "website");
        assert.ok(baseline.openGraph?.url, "homepage keeps its Open Graph URL");
        assert.equal(baseline.openGraph?.siteName, "LeakFanHub");
        assert.equal((baseline.twitter as { card?: string })?.card, "summary_large_image");
      }
      override = { ...saved, page: key, locale: locale ?? "en" };
      const result = await read();
      assertOverride(result);
      assert.deepEqual(result.alternates, baseline.alternates);
      assert.deepEqual(result.robots, baseline.robots);
      assert.deepEqual(result.openGraph?.url, baseline.openGraph?.url);
      assert.deepEqual(result.openGraph?.locale, baseline.openGraph?.locale);
      assert.deepEqual(reads.at(-1), [locale ?? "en", key]);
      if (key === "models") assert.equal(result.alternates?.canonical, `${locale && locale !== "en" ? `/${locale}` : ""}/models?sort=views&page=3`);
    }
  }
  reads.length = 0;
  await localized.localizedPageMetadata("fr", "/about", Promise.resolve({}));
  assert.deepEqual(reads, [], "editorial pages must not use discovery overrides");
});
