import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactNode } from "react";
import type { Metadata } from "next";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Search = Record<string, string | string[] | undefined>;
type Route = {
  default: (props: { params: Promise<{ path?: string[] }>; searchParams: Promise<Search> }) => Promise<ReactNode>;
  generateMetadata: (props: { params: Promise<{ path?: string[] }>; searchParams: Promise<Search> }) => Promise<Metadata>;
};
const creator = { handle: "aria-lune", name: "Aria $& Lune", bio: "Ma bio / My bio", avatarUrl: "", followers: 100, verified: true, urlVersion: 3, removedFromIndexAt: null };
const stats = { mediaCount: 100, photoCount: 70, videoCount: 30, engagedCount: 10, totalViews: 800, totalLikes: 20 };
const locales = ["en", "fr", "es", "de", "it", "pt", "nl"] as const;
const media = { id: "db-media", sourceId: "123", creatorHandle: "aria-lune", title: "Original source title", description: "Original source description", imageUrl: "/fixture.jpg", type: "photo", width: 100, height: 100, tags: [], views: 1, likes: 0, ageMinutes: 0, trending: 0, urlVersion: 2, createdAt: "2026-10-01T00:00:00Z" };
function setup(locale: "en" | "fr" | "es" | "de" | "it" | "pt" | "nl", options: { removed?: boolean; empty?: boolean } = {}) {
  const queries: Record<string, unknown>[] = [];
  const FollowButton = () => null;
  const VerifiedBadge = () => null;
  const replacements: Record<string, unknown> = {
    "@/lib/photos": {
      getCreatorCollectionContext: async () => ({ creator: { ...creator, removedFromIndexAt: options.removed ? "2026-10-29" : null }, stats: options.empty ? { ...stats, mediaCount: 0 } : stats }),
      getPhotos: async (query: Record<string, unknown>) => { queries.push(query); return { items: [], nextCursor: 60 }; },
      getPhotoByIdForPage: async () => media,
      getCreator: async () => ({ ...creator, removedFromIndexAt: options.removed ? "2026-10-29" : null }),
      getRelatedPhotos: async () => [],
      withCreator: (photo: typeof media) => ({ ...photo, creator }),
    },
    "next/navigation": {
      notFound: () => { throw new Error("NOT_FOUND"); },
      permanentRedirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
    },
    "@/components/Interactions": { FollowButton },
    "@/components/VerifiedBadge": { VerifiedBadge },
  };
  for (const [file, name] of [["AdSlot", "AdSlot"], ["AuthForm", "AuthForm"], ["ContactForm", "ContactForm"], ["CreatorCard", "CreatorCard"], ["FeaturedCreators", "FeaturedCreators"], ["FollowingFeed", "FollowingFeed"], ["ForYouGallery", "ForYouGallery"], ["HomeFilters", "HomeFilters"], ["InfiniteGallery", "InfiniteGallery"], ["JsonLd", "JsonLd"], ["LegalPage", "LegalPage"], ["MediaImg", "MediaImg"], ["ModelsGrid", "ModelsGrid"], ["SavedGallery", "SavedGallery"], ["BackLink", "BackLink"], ["FloatingBack", "FloatingBack"]]) replacements[`@/components/${file}`] = { [name]: () => null };
  const Support = () => null;
  for (const path of ["add", "feed", "premium", "recherche", "about", "conditions", "confidentialite", "contact", "dmca", "mentions-legales", "qu-est-ce-que-lumengallery", "trust-and-safety", "contact/support", "contact/signalement", "contact/partenariats", "contact/presse"]) replacements[`@/app/(default)/${path}/page`] = { __esModule: true, default: path === "contact/support" ? Support : () => null };
  const route = loadAppModule<Route>(`src/app/(${locale})/${locale}/[[...path]]/page.tsx`, replacements);
  const props = (path: string, search: Search = {}) => ({ params: Promise.resolve({ path: path === "/" ? undefined : path.slice(1).split("/") }), searchParams: Promise.resolve(search) });
  async function render(path: string, search: Search = {}) {
    let tree = await route.default(props(path, search));
    while (isValidElement(tree) && typeof tree.type === "function") tree = await (tree.type as (props: unknown) => ReactNode | Promise<ReactNode>)(tree.props);
    return tree;
  }
  return { route, props, render, queries, FollowButton, VerifiedBadge, Support };
}
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

test("every exact static route wins before creator parsing, including contact subpaths", async () => {
  // @ts-expect-error Native Node requires explicit suffixes.
  const { resolveLocalizedPage, LOCALIZED_ROUTE_PATHS } = await import("../src/lib/i18n/config.ts");
  for (const path of LOCALIZED_ROUTE_PATHS) assert.deepEqual(resolveLocalizedPage("fr", path), { kind: "static", pathname: path });
  const { route, props, render, queries } = setup("fr");
  assert.equal(await render("/contact/support"), null);
  assert.equal((await route.generateMetadata(props("/contact/support"))).title, "Support & aide");
  assert.equal(queries.length, 0);
});

test("localized overview and exactly the three collection paths reuse the renderer and locale", async () => {
  const intro = { en: "Browse", fr: "Parcourez", es: "Explora", de: "Entdecke", it: "Sfoglia", pt: "Explore", nl: "Bekijk" };
  const previous = { en: "Previous page", fr: "Page précédente", es: "Página anterior", de: "Vorherige Seite", it: "Pagina precedente", pt: "Página anterior", nl: "Vorige pagina" };
  const follow = { en: { follow: "Follow", following: "Following" }, fr: { follow: "Suivre", following: "Suivi·e" }, es: { follow: "Seguir", following: "Siguiendo" }, de: { follow: "Folgen", following: "Gefolgt" }, it: { follow: "Segui", following: "Seguito" }, pt: { follow: "Seguir", following: "A seguir" }, nl: { follow: "Volgen", following: "Volgend" } };
  const verified = { en: "Verified", fr: "Vérifié", es: "Verificado", de: "Verifiziert", it: "Verificato", pt: "Verificado", nl: "Geverifieerd" };
  for (const locale of locales) {
    const { route, props, render, queries, FollowButton, VerifiedBadge } = setup(locale);
    for (const collection of ["overview", "photos", "videos", "popular"]) {
      const path = `/aria-lune-v3${collection === "overview" ? "" : `/${collection}`}`;
      const tree = await render(path, { page: "2" });
      const metadata = await route.generateMetadata(props(path, { page: "2" }));
      assert.equal(metadata.alternates?.canonical, `/${locale}${path}?page=2`);
      assert.equal(queries.at(-1)?.cursor, 30);
      assert.equal(queries.at(-1)?.type, collection === "photos" ? "photo" : collection === "videos" ? "video" : undefined);
      assert.equal(queries.at(-1)?.sort, collection === "popular" ? "popular" : "recent");
      assert.ok(text(tree).includes(creator.name));
      assert.ok(text(tree).includes(creator.bio));
      assert.ok(text(tree).includes(intro[locale]));
      assert.ok(text(tree).includes(previous[locale]));
      const links = nodes(tree).filter((node) => node.props.href);
      assert.ok(links.some((node) => node.props.href === `/${locale}/aria-lune-v3/photos`));
      assert.deepEqual(nodes(tree).find((node) => node.type === FollowButton)?.props.labels, follow[locale]);
      assert.equal(nodes(tree).find((node) => node.type === VerifiedBadge)?.props.label, verified[locale]);
    }
  }
});

test("all seven localized media wrappers reuse media validation, reciprocal canonicals and source-authored text", async () => {
  const ogLocales = { en: "en_US", fr: "fr_FR", es: "es_ES", de: "de_DE", it: "it_IT", pt: "pt_PT", nl: "nl_NL" };
  for (const locale of locales) {
    const { route, props, render } = setup(locale);
    const tree = await render("/aria-lune/123-v2");
    const metadata = await route.generateMetadata(props("/aria-lune/123-v2"));
    assert.equal(metadata.alternates?.canonical, `/${locale}/aria-lune/123-v2`);
    assert.deepEqual(metadata.alternates?.languages, {
      en: "/en/aria-lune/123-v2", fr: "/fr/aria-lune/123-v2", es: "/es/aria-lune/123-v2",
      de: "/de/aria-lune/123-v2", it: "/it/aria-lune/123-v2", pt: "/pt/aria-lune/123-v2",
      nl: "/nl/aria-lune/123-v2", "x-default": "/aria-lune/123-v2",
    });
    assert.equal(metadata.openGraph?.locale, ogLocales[locale]);
    assert.equal(metadata.description, "Original source description");
    assert.ok(text(tree).includes("Original source title"));
    assert.ok(nodes(tree).some((node) => node.props.href === `/${locale}/aria-lune-v3`));
    await assert.rejects(render("/aria-lune/123-v1"), /NOT_FOUND/);
    await assert.rejects(route.generateMetadata(props("/aria-lune/123-v1")), /NOT_FOUND/);
    // A profile version belongs to its profile URL, never to a media's owner segment.
    for (const owner of ["aria-lune-v3", "aria-lune-v999", "aria-lune%2Dv999"]) {
      await assert.rejects(render(`/${owner}/123-v2`), /NOT_FOUND/);
      await assert.rejects(route.generateMetadata(props(`/${owner}/123-v2`)), /NOT_FOUND/);
    }
    await assert.rejects(setup(locale, { removed: true }).render("/aria-lune/123-v2"), /NOT_FOUND/);
  }
});

test("localized metadata is reciprocal for seven languages and x-default on every collection and page", async () => {
  const en = setup("en");
  const fr = setup("fr");
  for (const collection of ["overview", "photos", "videos", "popular"]) for (const page of [1, 2, 3]) {
    const path = `/aria-lune-v3${collection === "overview" ? "" : `/${collection}`}`;
    const suffix = page === 1 ? "" : `?page=${page}`;
    const english = await en.route.generateMetadata(en.props(path, { page: String(page) }));
    const french = await fr.route.generateMetadata(fr.props(path, { page: String(page) }));
    const languages = { en: `/en${path}${suffix}`, fr: `/fr${path}${suffix}`, es: `/es${path}${suffix}`, de: `/de${path}${suffix}`, it: `/it${path}${suffix}`, pt: `/pt${path}${suffix}`, nl: `/nl${path}${suffix}`, "x-default": `${path}${suffix}` };
    assert.deepEqual(english.alternates?.languages, languages);
    assert.deepEqual(french.alternates?.languages, languages);
    assert.equal(french.alternates?.canonical, languages.fr);
    assert.equal(english.alternates?.canonical, languages.en);
    assert.notEqual(english.description, french.description);
  }
});

test("malformed content paths, extra segments and nested locale prefixes never dispatch", async () => {
  // @ts-expect-error Native Node requires explicit suffixes.
  const { resolveLocalizedPage } = await import("../src/lib/i18n/config.ts");
  for (const path of ["/aria-lune-v3/photos/extra", "/es/aria-lune-v3", "/en/aria-lune-v3", "/fr/aria-lune-v3", "/aria-lune-v3//photos", "/%E0%A4%A", "/aria%2Flune/photos"]) {
    assert.equal(resolveLocalizedPage("en", path), null, path);
    for (const locale of ["en", "fr"] as const) {
      const { route, props, render } = setup(locale);
      await assert.rejects(render(path), /NOT_FOUND/, path);
      await assert.rejects(route.generateMetadata(props(path)), /NOT_FOUND/, path);
    }
  }
});

test("expanded content locale wrappers still reject untranslated editorial pages", async () => {
  for (const locale of ["es", "de", "it", "pt", "nl"] as const) {
    const { route, props, render, queries } = setup(locale);
    for (const path of ["/about", "/contact/support"]) {
      await assert.rejects(render(path), /NOT_FOUND/, `${locale}${path}`);
      await assert.rejects(route.generateMetadata(props(path)), /NOT_FOUND/, `${locale}${path}`);
    }
    assert.equal(queries.length, 0, "unsupported routes never query a creator gallery");
  }
});

test("localized routes preserve renderer version, removal, query and redirect policy", async () => {
  for (const locale of locales) {
    const { route, props, render } = setup(locale);
    await assert.rejects(render("/aria-lune-v2/photos"), /NOT_FOUND/);
    await assert.rejects(route.generateMetadata(props("/aria-lune-v2/photos")), /NOT_FOUND/);
    await assert.rejects(setup(locale, { removed: true }).render("/aria-lune-v3"), /NOT_FOUND/);
    await assert.rejects(setup(locale, { empty: true }).render("/aria-lune-v3"), /NOT_FOUND/);
    await assert.rejects(render("/aria-lune-v3", { type: "photo" }), new RegExp(`REDIRECT:/${locale}/aria-lune-v3/photos`));
    for (const search of [{ sort: "liked" }, { page: "invalid" }, { page: "100" }]) {
      const metadata = await route.generateMetadata(props("/aria-lune-v3/photos", search));
      assert.equal((metadata.robots as { index: boolean }).index, false);
    }
  }
});
