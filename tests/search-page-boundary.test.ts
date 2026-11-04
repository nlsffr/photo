import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactNode } from "react";
import type { Metadata } from "next";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function nodes(tree: ReactNode): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}
function text(tree: ReactNode): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join("");
  return isValidElement<{ children?: ReactNode }>(tree) ? text(tree.props.children) : "";
}

test("the Next search route accepts its search parameters and delegates rendering without custom route props", async () => {
  const SearchPage = () => null;
  const route = loadAppModule<{ default: (props: { searchParams: SearchParams }) => ReactNode; metadata: Metadata }>("src/app/(default)/recherche/page.tsx", {
    "@/features/search/SearchPage": { __esModule: true, default: SearchPage },
    "@/lib/photos": { getPhotos: () => { throw new Error("The route must delegate to the shared search renderer."); } },
  });
  const searchParams = Promise.resolve({ q: "unchanged" });
  const tree = await route.default({ searchParams });
  assert.ok(isValidElement<{ searchParams: SearchParams; locale?: string }>(tree));
  assert.equal(tree.type, SearchPage);
  assert.equal(tree.props.searchParams, searchParams);
  assert.equal(tree.props.locale, undefined);
  assert.deepEqual(route.metadata, { title: "Search", robots: { index: false, follow: true } });
});

test("the extracted renderer preserves search/filter queries, English default, French copy and creator links", async () => {
  for (const locale of [undefined, "fr"] as const) {
    const queries: unknown[] = [];
    const creators = Array.from({ length: 4 }, (_, index) => ({ handle: `sample-${index}`, name: `Sample ${index}`, urlVersion: 3, followers: 7, verified: true, avatarUrl: "/avatar.jpg" }));
    const components = Object.fromEntries(["SearchForm", "InfiniteGallery", "MediaTypeTabs", "AiFilterTabs", "MediaImg", "VerifiedBadge"].map(name => [`@/components/${name}`, { [name]: () => null }]));
    const { default: SearchPage } = loadAppModule<{ default: (props: { searchParams: SearchParams; locale?: "fr" }) => Promise<ReactNode> }>("src/features/search/SearchPage.tsx", {
      ...components,
      "next/link": { __esModule: true, default: "a" },
      "@/lib/photos": {
        getPhotos: async (query: unknown) => { queries.push(query); return { items: [], total: 2, nextCursor: null }; },
        getAllTags: async () => ["portrait"],
        searchCreators: async (q: string, limit: number) => { queries.push({ q, limit }); return creators; },
      },
    });
    const tree = await SearchPage({ locale, searchParams: Promise.resolve({ q: [" sample ", "ignored"], tag: "portrait", type: "video", ai: "0" }) });
    assert.deepEqual(queries, [{ q: " sample ", tag: "portrait", type: "video", isAi: false, sort: "popular" }, { q: "sample", limit: 12 }]);
    const content = text(tree);
    assert.ok(content.includes(locale === "fr" ? "Recherche" : "Search"));
    assert.equal((content.match(/TOP/g) || []).length, 3);
    assert.deepEqual(nodes(tree).filter(node => node.type === "a").map(node => node.props.href), creators.map(creator => `/${creator.handle}-v3`));
    assert.ok(nodes(tree).some(node => node.props.basePath === "/recherche"));
    const gallery = nodes(tree).find(node => node.props.initial && node.props.params);
    assert.deepEqual(gallery?.props.params, { sort: "popular", q: " sample ", tag: "portrait", type: "video", ai: "0" });
  }
});
