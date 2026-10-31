import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactElement } from "react";
import type { Metadata } from "next";
// @ts-expect-error Native Node requires the explicit suffix.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Search = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<Search> };
type ModelsRoute = {
  metadata?: Metadata;
  generateMetadata?: (props: PageProps) => Promise<Metadata>;
  default: (props: PageProps) => Promise<ReactElement>;
};
type LocalizedRoutes = {
  localizedPageMetadata: (locale: string, path: string, search: Promise<Search>) => Promise<Metadata>;
  LocalizedPage: (props: PageProps & { locale: string; pathname: string }) => Promise<ReactElement>;
};

function routes() {
  const reads: unknown[][] = [];
  const creator = {
    handle: "fixture-creator", name: "Fixture creator", avatarUrl: "", bio: "", location: "",
    followers: 10, verified: false, photoCount: 1, totalViews: 20, totalLikes: 0, coverUrl: "",
  };
  const replacements: Record<string, unknown> = {
    "@/lib/photos": {
      getModels: async (...args: unknown[]) => { reads.push(args); return Array.from({ length: 61 }, (_, index) => ({ ...creator, handle: `fixture-${index}` })); },
      getModelCount: async () => 240,
    },
    "@/features/creator/CreatorCollectionPage": {},
    "@/features/media/MediaDetailPage": {},
  };
  for (const name of ["AdSlot", "AuthForm", "ContactForm", "CreatorCard", "FeaturedCreators", "FollowingFeed", "ForYouGallery", "HomeFilters", "InfiniteGallery", "JsonLd", "LegalPage", "MediaImg", "ModelsGrid", "SavedGallery", "VerifiedBadge"]) {
    replacements[`@/components/${name}`] = { [name]: () => null };
  }
  for (const path of ["add", "feed", "premium", "recherche", "about", "conditions", "confidentialite", "contact", "dmca", "mentions-legales", "qu-est-ce-que-lumengallery", "trust-and-safety", "contact/support", "contact/signalement", "contact/partenariats", "contact/presse"]) {
    replacements[`@/app/(default)/${path}/page`] = { __esModule: true, default: () => null };
  }
  return {
    reads,
    models: loadAppModule<ModelsRoute>("src/app/(default)/models/page.tsx", replacements),
    localized: loadAppModule<LocalizedRoutes>("src/features/i18n/LocalizedPage.tsx", replacements),
  };
}

const requests: { search: Search; suffix: string; sort: string; offset: number }[] = [
  { search: {}, suffix: "", sort: "followers", offset: 0 },
  { search: { page: "2" }, suffix: "?page=2", sort: "followers", offset: 60 },
  { search: { sort: "views", page: "1" }, suffix: "?sort=views", sort: "views", offset: 0 },
  { search: { sort: "views", page: "3", tracking: "discard" }, suffix: "?sort=views&page=3", sort: "views", offset: 120 },
  { search: { sort: ["views", "followers"], page: ["2", "7"] }, suffix: "?sort=views&page=2", sort: "views", offset: 60 },
  { search: { sort: "unknown", page: "2extra" }, suffix: "?page=2", sort: "followers", offset: 60 },
  { search: { page: "1" }, suffix: "", sort: "followers", offset: 0 },
  { search: { page: "16667" }, suffix: "?page=16667", sort: "followers", offset: 999960 },
  ...["invalid", "-2", "0", "16668", "999999999", "9".repeat(400)].map((page) => ({ search: { page }, suffix: "", sort: "followers", offset: 0 })),
];

test("models canonical, Open Graph and reciprocal alternates retain the rendered page and valid sort", async () => {
  const { models, localized } = routes();
  for (const { search, suffix } of requests) {
    for (const locale of ["", "en", "fr", "es", "de", "it", "pt", "nl"]) {
      const base = locale ? `/${locale}/models` : "/models";
      const metadata = locale
        ? await localized.localizedPageMetadata(locale, "/models", Promise.resolve(search))
        : models.generateMetadata ? await models.generateMetadata({ searchParams: Promise.resolve(search) }) : models.metadata!;
      assert.equal(metadata.alternates?.canonical, `${base}${suffix}`, `${locale || "default"}: ${JSON.stringify(search)}`);
      assert.deepEqual(metadata.alternates?.languages, {
        en: `/en/models${suffix}`, fr: `/fr/models${suffix}`, es: `/es/models${suffix}`,
        de: `/de/models${suffix}`, it: `/it/models${suffix}`, pt: `/pt/models${suffix}`,
        nl: `/nl/models${suffix}`, "x-default": `/models${suffix}`,
      });
      assert.equal(new URL(String(metadata.openGraph?.url), "https://leakfanhub.com").href, `https://leakfanhub.com${base}${suffix}`);
    }
  }
});

test("models rendering uses the same normalized page as its metadata and collection JSON-LD", async () => {
  const { reads, models, localized } = routes();
  for (const { search, suffix, sort, offset } of requests) {
    for (const locale of ["", "en", "fr", "es", "de", "it", "pt", "nl"]) {
      reads.length = 0;
      let tree = locale
        ? await localized.LocalizedPage({ locale, pathname: "/models", searchParams: Promise.resolve(search) })
        : await models.default({ searchParams: Promise.resolve(search) });
      if (typeof tree.type === "function") tree = await (tree.type as (props: unknown) => Promise<ReactElement>)(tree.props);
      assert.deepEqual(reads, [[sort, 61, offset]]);
      assert.ok(isValidElement(tree));
      const children = (tree.props as { children: ReactElement[] }).children;
      const data = (children[0].props as { data: { url: string; mainEntity: { itemListElement: { position: number }[] } } }).data;
      assert.equal(data.url, `https://leakfanhub.com${locale ? `/${locale}` : ""}/models${suffix}`);
      assert.equal(data.mainEntity.itemListElement[0].position, offset + 1);
      const grid = children[children.length - 1].props as { initialModels: unknown[]; initialNextOffset: number; sort: string };
      assert.equal(grid.initialModels.length, 60);
      assert.equal(grid.initialNextOffset, offset + 60);
      assert.equal(grid.sort, sort);
    }
  }
});
