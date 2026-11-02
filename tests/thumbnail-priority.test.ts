import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType, ReactNode } from "react";
import type { CreatorWithStats, PhotoPage, PhotoView } from "../src/lib/types";
// @ts-expect-error Native Node needs explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";
// @ts-expect-error Native Node needs explicit suffixes.
import { getDictionary } from "../src/lib/i18n/dictionaries.ts";

const dictionary = getDictionary("en");
const locale = { useLocale: () => ({ locale: "en", dictionary, t: (key: string) => key }) };
const boundaries: Record<string, unknown> = {
  "./LocaleProvider": locale,
  "./Interactions": { useInteractions: () => ({ ready: false, isLiked: () => false, isSaved: () => false }) },
  "./AdSlot": { AdSlot: () => null },
};
const creator = (index: number): CreatorWithStats => ({
  handle: `fixture-${index}`, name: `Creator ${index}`, avatarUrl: `/media/creator-${index}.jpg`, coverUrl: "",
  bio: "", location: "", followers: 1, verified: false, photoCount: 1, totalViews: 1, totalLikes: 0,
});
const photo = (index: number): PhotoView => ({
  id: String(index), creatorHandle: "fixture", title: `Media ${index}`, imageUrl: `/media/image-${index}.jpg`,
  width: 100, height: 100, tags: [], views: 0, likes: 0, ageMinutes: 0, trending: 0,
  type: index === 0 ? "video" : "photo", videoUrl: index === 0 ? "/media/clip.mp4" : undefined,
  creator: { handle: "fixture", name: "Fixture", avatarUrl: "/media/avatar.jpg", verified: false },
});
function images(html: string): Array<Record<string, string>> {
  return [...html.matchAll(/<img\b[^>]*>/g)].map(([tag]) => Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name.toLowerCase(), value]),
  ));
}
function expectPriorityPair(imgs: Array<Record<string, string>>, count: number) {
  assert.equal(imgs.length, count);
  assert.equal(imgs.filter((image) => image.fetchpriority === "high").length, Math.min(2, count));
  imgs.forEach((image, index) => {
    assert.equal(image.loading, index < 2 ? "eager" : "lazy");
    assert.equal(image.fetchpriority, index < 2 ? "high" : undefined);
  });
}

test("real gallery SSR prioritizes only its first two thumbnails, never avatars or video data", () => {
  const { InfiniteGallery } = loadAppModule<{ InfiniteGallery: ComponentType<{ initial: PhotoPage; params: { sort: "recent" } }> }>("src/components/InfiniteGallery.tsx", boundaries);
  const html = renderToStaticMarkup(React.createElement(InfiniteGallery, {
    initial: { items: Array.from({ length: 30 }, (_, i) => photo(i)), nextCursor: 30, total: 60 }, params: { sort: "recent" },
  }));
  const all = images(html);
  expectPriorityPair(all.filter((image) => image.alt.startsWith("Media ")), 30);
  assert.equal(all.filter((image) => image.fetchpriority === "high").length, 2);
  assert.ok(all.filter((image) => image.src === "/media/avatar.jpg").every((image) => image.loading === "lazy" && !image.fetchpriority));
  assert.match(html, /<video\b[^>]*src="\/media\/clip\.mp4"[^>]*preload="none"/);
});

test("real model SSR and localized influencer grid prioritize only their first two cards", async () => {
  const models = Array.from({ length: 8 }, (_, index) => creator(index));
  const { ModelsGrid } = loadAppModule<{ ModelsGrid: ComponentType<Record<string, unknown>> }>("src/components/ModelsGrid.tsx", boundaries);
  const html = renderToStaticMarkup(React.createElement(ModelsGrid, {
    initialModels: models, initialHasMore: false, initialNextOffset: null, sort: "followers", locale: "en",
  }));
  expectPriorityPair(images(html), 8);
  const replacements: Record<string, unknown> = { ...boundaries, "server-only": {}, "./seo-editor-store": { readSeoOverride: async () => null }, "@/lib/photos": { getModels: async () => models } };
  for (const name of ["AdSlot", "AuthForm", "ContactForm", "FeaturedCreators", "FollowingFeed", "ForYouGallery", "HomeFilters", "InfiniteGallery", "JsonLd", "LegalPage", "SavedGallery"]) replacements[`@/components/${name}`] = { [name]: () => null };
  for (const path of ["add", "feed", "premium", "recherche", "about", "conditions", "confidentialite", "contact", "dmca", "mentions-legales", "qu-est-ce-que-lumengallery", "trust-and-safety", "contact/support", "contact/signalement", "contact/partenariats", "contact/presse"]) replacements[`@/app/(default)/${path}/page`] = { __esModule: true, default: () => null };
  replacements["@/features/creator/CreatorCollectionPage"] = {};
  replacements["@/features/media/MediaDetailPage"] = {};
  const { LocalizedPage } = loadAppModule<{ LocalizedPage(props: object): Promise<React.ReactElement> }>("src/features/i18n/LocalizedPage.tsx", replacements);
  let tree = await LocalizedPage({ locale: "de", pathname: "/influenceuses-tendances", searchParams: Promise.resolve({}) });
  if (typeof tree.type === "function") tree = await (tree.type as (props: unknown) => Promise<React.ReactElement>)(tree.props);
  expectPriorityPair(images(renderToStaticMarkup(tree)), 8);
});

test("MediaImg has matching native and Next Image priority without changing its source", () => {
  const { MediaImg } = loadAppModule<{ MediaImg: ComponentType<{ src: string; alt: string; width: number; height: number; priority?: boolean; fill?: boolean }> }>("src/components/MediaImg.tsx");
  for (const src of ["/media/native.jpg?width=20", "https://cdn.example.test/image.jpg?signature=fixture"]) {
    for (const fill of [false, true]) for (const priority of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(MediaImg, { src, alt: "Fixture", width: 100, height: 100, fill, priority }));
      const image = images(html)[0];
      assert.equal(image.src, src.replaceAll("&", "&amp;"));
      assert.equal(image.loading, priority ? "eager" : "lazy");
      assert.equal(image.fetchpriority, priority ? "high" : undefined);
      assert.doesNotMatch(html, /_next\/image/);
    }
  }
});

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(tree: ReactNode): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!React.isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}
function hooks() {
  const slots: unknown[] = [];
  let cursor = 0;
  return {
    reset: () => { cursor = 0; },
    react: { ...React,
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], (next: unknown) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
      },
      useRef(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
      useEffect: () => {}, useCallback: (fn: unknown) => fn,
    },
  };
}

test("appending gallery and model pages gives no new card high priority", async (t) => {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  for (const gallery of [true, false]) {
    const state = hooks();
    const replacements = { ...boundaries, react: state.react };
    const component = loadAppModule<Record<string, (props: object) => ReactNode>>(gallery ? "src/components/InfiniteGallery.tsx" : "src/components/ModelsGrid.tsx", replacements);
    const props = gallery
      ? { initial: { items: [photo(0), photo(1), photo(2)], nextCursor: 3, total: 6 }, params: { sort: "recent" } }
      : { initialModels: [creator(0), creator(1), creator(2)], initialHasMore: true, initialNextOffset: 3, sort: "followers" };
    const render = () => { state.reset(); return component[gallery ? "InfiniteGallery" : "ModelsGrid"](props); };
    let tree = render();
    globalThis.fetch = async () => Response.json(gallery
      ? { items: [photo(3), photo(4)], nextCursor: null, total: 6 }
      : { items: [creator(3), creator(4)], hasMore: false, nextOffset: null });
    const button = nodes(tree).find((node) => node.type === "button" && node.props.onClick);
    assert.ok(button);
    await (button.props.onClick as () => Promise<void>)();
    // Gallery invokes loadMore with void; allow the resolved JSON promise to settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    tree = render();
    const cards = nodes(tree).filter((node) => Object.hasOwn(node.props, gallery ? "photo" : "creator"));
    assert.equal(cards.length, 5);
    assert.deepEqual(cards.map((card) => card.props.priority), [true, true, false, false, false]);
  }
});

test("a prioritized native image retains ordered fallback and exhausted placeholder behavior", () => {
  const state = hooks();
  const { MediaImg } = loadAppModule<{ MediaImg(props: object): React.ReactElement<Record<string, unknown>> }>("src/components/MediaImg.tsx", { react: state.react });
  const render = () => { state.reset(); return MediaImg({ src: "/media/first.jpg", fallbackSrc: "/media/fallback.jpg", alt: "Fixture", priority: true, width: 10, height: 10 }); };
  let tree = render();
  for (const expected of ["/media/first.jpg", "/media/fallback.jpg"]) {
    assert.equal(tree.props.src, expected);
    assert.equal(tree.props.loading, "eager");
    assert.equal(tree.props.fetchPriority, "high");
    const ref = tree.props.ref as { current: object | null };
    const element = {};
    ref.current = element;
    (tree.props.onError as (event: object) => void)({ currentTarget: element });
    tree = render();
  }
  assert.equal(tree.type, "div");
  assert.equal(tree.props["aria-hidden"], true);
});
