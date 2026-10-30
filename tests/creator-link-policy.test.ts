import assert from "node:assert/strict";
import test from "node:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Metadata } from "next";
import type { CreatorWithStats, Photo, PhotoView } from "../src/lib/types";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Node = { type: unknown; props: Record<string, unknown> };
type Schema = {
  "@type": string;
  url: string;
  author: { url: string };
  mainEntity: { itemListElement: Array<{ url: string }> };
  itemListElement: Array<{ item: { url: string } }>;
};
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}
const creator: CreatorWithStats = { handle: "aria-lune", name: "Aria Lune", bio: "Bio", avatarUrl: "/avatar.jpg", coverUrl: "", location: "", followers: 10, verified: true, urlVersion: 3, photoCount: 30, totalViews: 90, totalLikes: 10 };
const photo: Photo = { id: "db-id", sourceId: "123", title: '</script><script>alert("x")</script>', type: "photo", creatorHandle: "aria-lune", imageUrl: "/photo.jpg", videoUrl: "/video.mp4", createdAt: "2026-10-01T00:00:00Z", urlVersion: 2, width: 100, height: 100, tags: [], views: 4, likes: 2, ageMinutes: 0, trending: 0 };
const boundaryComponents = Object.fromEntries(["PhotoCard", "VerifiedBadge", "MediaImg", "VideoPlayer", "Comments", "BackLink", "FloatingBack", "RecordView", "InfiniteGallery"].map((name) => [`@/components/${name}`, { [name]: () => null }]));
const boundaries = { ...boundaryComponents, "@/components/Interactions": { FollowButton: () => null, PostActions: () => null }, "next/navigation": { notFound: () => { throw Error("NOT_FOUND"); }, permanentRedirect: () => { throw Error("REDIRECT"); } } };
function scripts(tree: ReactNode): Schema[] {
  return nodes(tree).filter((node) => typeof node.type === "function" && node.type.name === "JsonLd").flatMap((node) => {
    const script = (node.type as (props: unknown) => Node)(node.props);
    const html = (script.props.dangerouslySetInnerHTML as { __html: string }).__html;
    assert.equal(html.includes("<"), false);
    return JSON.parse(html);
  });
}

test("CreatorCard preserves supported creator locales and uses canonical links for discovery-only locales", () => {
  const { CreatorCard } = loadAppModule<{ CreatorCard: (props: { creator: CreatorWithStats; locale?: "en" | "fr" | "es" | "de" | "it" | "pt" | "nl" }) => ReactNode }>("src/components/CreatorCard.tsx", boundaries);
  assert.equal(nodes(CreatorCard({ creator }))[0].props.href, "/aria-lune-v3");
  assert.equal(nodes(CreatorCard({ creator, locale: "en" }))[0].props.href, "/en/aria-lune-v3");
  assert.equal(nodes(CreatorCard({ creator, locale: "fr" }))[0].props.href, "/fr/aria-lune-v3");
  for (const locale of ["es", "de", "it", "pt", "nl"] as const) {
    assert.equal(nodes(CreatorCard({ creator, locale }))[0].props.href, "/aria-lune-v3");
  }
});

test("media pages link to overview without a creator-wide aggregate or localized canonical media URLs", async () => {
  for (const type of ["photo", "video", "pack"] as const) {
    const queries: string[] = [];
    const media = { ...photo, type };
    const route = loadAppModule<{ default: (props: unknown) => Promise<ReactNode>; generateMetadata: (props: unknown) => Promise<Metadata> }>("src/app/(default)/[handle]/[id]/page.tsx", {
      ...boundaries,
      "@/lib/photos": {
        getPhotoByIdForPage: async () => { queries.push("media"); return media; },
        getCreator: async () => { queries.push("creator"); return creator; },
        getCreatorCollectionContext: async () => { throw new Error("Unexpected creator-wide aggregate"); },
        getRelatedPhotos: async () => { queries.push("related"); return []; },
        withCreator: (item: Photo) => ({ ...item, creator }),
      },
    });
    const props = { params: Promise.resolve({ handle: "aria-lune", id: "123-v2" }) };
    const tree = await route.default(props);
    const hrefs = nodes(tree).map((node) => node.props.href).filter(Boolean);
    assert.ok(hrefs.includes("/aria-lune-v3"));
    assert.equal(hrefs.includes("/aria-lune-v3/photos"), false);
    assert.equal(hrefs.includes("/aria-lune-v3/videos"), false);
    assert.ok(hrefs.includes("/dmca?photo=db-id"));
    assert.ok(hrefs.every((href) => typeof href === "string" && !/^\/(en|fr)\//.test(href)));
    assert.deepEqual(queries, ["media", "creator", "related"]);
    const ld = scripts(tree);
    assert.equal(ld.find((item) => item["@type"] === (type === "video" ? "VideoObject" : "ImageObject"))!.author.url, "https://leakfanhub.com/aria-lune-v3");
    assert.equal((await route.generateMetadata(props)).alternates?.canonical, "/aria-lune/123-v2");
  }
});

test("creator renderer uses the loaded page for structured data with one gallery query and no item lookup", async () => {
  let contextReads = 0;
  const queries: unknown[] = [];
  const items: PhotoView[] = [{ ...photo, creator }];
  const renderer = loadAppModule<{ CreatorCollectionPage: (props: unknown) => Promise<ReactNode> }>("src/features/creator/CreatorCollectionPage.tsx", {
    ...boundaries,
    "@/lib/photos": {
      getCreatorCollectionContext: async () => { contextReads++; return { creator, stats: { mediaCount: 30, photoCount: 26, videoCount: 4, engagedCount: 10, totalViews: 90, totalLikes: 10 } }; },
      getPhotos: async (query: unknown) => { queries.push(query); return { items, nextCursor: null, total: 30 }; },
      getPhotoByIdForPage: () => { throw Error("Unexpected per-item query"); },
      getCreator: () => { throw Error("Unexpected creator query"); },
    },
  });
  const props = { handleParam: "aria-lune-v3", collection: "photos", locale: "fr", searchParams: { page: "2" } };
  const data = scripts(await renderer.CreatorCollectionPage(props));
  assert.equal(data.find((item) => item["@type"] === "CollectionPage")!.url, "https://leakfanhub.com/fr/aria-lune-v3/photos?page=2");
  assert.equal(data.find((item) => item["@type"] === "ItemList")!.itemListElement[0].item.url, "https://leakfanhub.com/aria-lune/123-v2");
  assert.deepEqual(queries, [{ creator: "aria-lune", type: "photo", sort: "recent", cursor: 30, limit: 30 }]);
  assert.equal(contextReads, 1);
  items[0].removedFromIndexAt = "2026-10-29";
  const removedData = scripts(await renderer.CreatorCollectionPage(props));
  assert.deepEqual(removedData.find((item) => item["@type"] === "ItemList")!.itemListElement, []);
  assert.equal(queries.length, 2, "one additional page render performs exactly one gallery read, with no replacement read");
  assert.equal(contextReads, 2);
});


test("localized discovery surfaces link only to translated or canonical creator pages", async () => {
  for (const locale of ["en", "fr", "es", "de", "it", "pt", "nl"] as const) {
    const creatorPath = locale === "en" || locale === "fr" ? `/${locale}/aria-lune-v3` : "/aria-lune-v3";
    const replacements: Record<string, unknown> = {
      ...boundaries,
      "./LocaleProvider": { useLocale: () => ({ locale, t: (key: string) => key }) },
      "@/lib/photos": {
        getModels: async () => [creator],
        getModelCount: async () => 1,
        getRankings: async () => [{ ...creator, views: 10, score: 5 }],
        getPhotos: async () => ({ items: [], nextCursor: null, total: 0 }),
        getAllTags: async () => [],
      },
    };
    for (const name of ["AdSlot", "AuthForm", "ContactForm", "FollowingFeed", "ForYouGallery", "HomeFilters", "LegalPage", "SavedGallery"]) replacements[`@/components/${name}`] = { [name]: () => null };
    for (const path of ["add", "feed", "premium", "recherche", "about", "conditions", "confidentialite", "contact", "dmca", "mentions-legales", "qu-est-ce-que-lumengallery", "trust-and-safety", "contact/support", "contact/signalement", "contact/partenariats", "contact/presse"]) replacements[`@/app/(default)/${path}/page`] = { __esModule: true, default: () => null };
    const { LocalizedPage } = loadAppModule<{ LocalizedPage: (props: unknown) => Promise<ReactNode> }>("src/features/i18n/LocalizedPage.tsx", replacements);
    for (const pathname of ["/", "/models", "/classements", "/influenceuses-tendances"]) {
      let tree = await LocalizedPage({ locale, pathname, searchParams: Promise.resolve({}) });
      while (isValidElement(tree) && typeof tree.type === "function") tree = await (tree.type as (props: unknown) => ReactNode)(tree.props);
      // FeaturedCreators is an async server component: resolve it before the sync SSR pass.
      const featured = nodes(tree).find((node) => typeof node.type === "function" && node.type.name === "FeaturedCreators");
      if (featured) {
        const featuredTree = await (featured.type as (props: unknown) => Promise<ReactNode>)(featured.props);
        assert.ok(nodes(featuredTree).some((node) => node.props.href === creatorPath));
      } else {
        const html = renderToStaticMarkup(tree);
        assert.ok(html.includes(`href="${creatorPath}"`), pathname);
      }
      if (pathname === "/models") {
        assert.equal(scripts(tree)[0].mainEntity.itemListElement[0].url, `https://leakfanhub.com${creatorPath}`);
      }
      if (pathname === "/classements") {
        const expected = { en: "Creator rankings", fr: "Classement des créateurs", es: "Clasificación de creadores", de: "Creator-Ranglisten", it: "Classifiche dei creator", pt: "Classificações de criadores", nl: "Ranglijst van creators" };
        assert.ok(renderToStaticMarkup(tree).includes(expected[locale]), `${locale} ranking heading`);
      }
    }
    const { FeaturedCreators } = loadAppModule<{ FeaturedCreators: (props?: unknown) => Promise<ReactNode> }>("src/components/FeaturedCreators.tsx", replacements);
    assert.ok(nodes(await FeaturedCreators()).some((node) => node.props.href === "/aria-lune-v3"));
    const { ModelsGrid } = loadAppModule<{ ModelsGrid: (props: { initialModels: CreatorWithStats[]; initialHasMore: boolean; initialNextOffset: number | null; sort: "followers" }) => ReactNode }>("src/components/ModelsGrid.tsx", replacements);
    const legacy = renderToStaticMarkup(createElement(ModelsGrid, { initialModels: [creator], initialHasMore: false, initialNextOffset: null, sort: "followers" }));
    assert.ok(legacy.includes('href="/aria-lune-v3"'));
  }
});

test("media pages keep one bounded creator read regardless of collection eligibility", async () => {
  for (const type of ["photo", "video"] as const) {
    const reads: string[] = [];
    const route = loadAppModule<{ default: (props: unknown) => Promise<ReactNode> }>("src/app/(default)/[handle]/[id]/page.tsx", {
      ...boundaries,
      "@/lib/photos": {
        getPhotoByIdForPage: async () => { reads.push("media"); return { ...photo, type }; },
        getCreator: async () => { reads.push("creator"); return creator; },
        getCreatorCollectionContext: async () => { throw new Error("Unexpected creator-wide aggregate"); },
        getRelatedPhotos: async () => { reads.push("related"); return []; },
        withCreator: (item: Photo) => ({ ...item, creator }),
      },
    });
    const tree = await route.default({ params: Promise.resolve({ handle: "aria-lune", id: "123-v2" }) });
    const hrefs = nodes(tree).map((node) => node.props.href).filter(Boolean);
    assert.ok(hrefs.includes("/aria-lune-v3"));
    assert.equal(hrefs.includes("/aria-lune-v3/photos"), false);
    assert.equal(hrefs.includes("/aria-lune-v3/videos"), false);
    assert.deepEqual(reads, ["media", "creator", "related"]);
  }
});

test("guest account and feed controls use available functional routes from every discovery language", () => {
  for (const locale of ["en", "fr", "es", "de", "it", "pt", "nl"] as const) {
    const functionalLocale = locale === "fr" ? "fr" : "en";
    const replacements = {
      "./LocaleProvider": { useLocale: () => ({ locale, t: (key: string) => key }) },
      "./Session": { useSession: () => ({ user: null, loading: false }) },
      "next/navigation": { useRouter: () => ({}) },
    };
    const { AccountMenu } = loadAppModule<{ AccountMenu: () => ReactNode }>("src/components/AccountMenu.tsx", replacements);
    const accountHtml = renderToStaticMarkup(createElement(AccountMenu));
    assert.ok(accountHtml.includes(`href="/${functionalLocale}/connexion"`));
    assert.ok(accountHtml.includes(`href="/${functionalLocale}/inscription"`));
    const { HomeFilters } = loadAppModule<{ HomeFilters: (props: { tags: string[]; sort: "discover" }) => ReactNode }>("src/components/HomeFilters.tsx", replacements);
    const filtersHtml = renderToStaticMarkup(createElement(HomeFilters, { tags: [], sort: "discover" }));
    assert.ok(filtersHtml.includes(`href="/${functionalLocale}/feed"`));
    assert.ok(filtersHtml.includes(`href="/${locale}?sort=trending"`));
  }
});
