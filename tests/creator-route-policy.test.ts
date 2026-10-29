import assert from "node:assert/strict";
import test from "node:test";
import { isValidElement, type ReactNode } from "react";
import type { Metadata } from "next";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const stats = {
  mediaCount: 100,
  photoCount: 70,
  videoCount: 30,
  engagedCount: 10,
  totalViews: 800,
  totalLikes: 20,
};
const creator = {
  handle: "aria-lune",
  name: "Aria Lune",
  avatarUrl: "",
  verified: true,
  followers: 100,
  urlVersion: 3,
  bio: "A public creator",
  removedFromIndexAt: null,
};
type Search = Record<string, string | string[] | undefined>;
type Route = {
  default: (props: {
    params: Promise<{ handle: string }>;
    searchParams: Promise<Search>;
  }) => Promise<ReactNode>;
  generateMetadata: (props: {
    params: Promise<{ handle: string }>;
    searchParams: Promise<Search>;
  }) => Promise<Metadata>;
};
function setup(
  collection = "overview",
  options: {
    stats?: typeof stats;
    creator?: typeof creator;
    nextCursor?: number | null;
  } = {},
) {
  const queries: Record<string, unknown>[] = [];
  const Gallery = () => null;
  const replacements: Record<string, unknown> = {
    "@/lib/photos": {
      getCreator: async () => options.creator ?? creator,
      getCreatorStats: async () => ({
        photoCount: 100,
        totalViews: 800,
        totalLikes: 20,
      }),
      getCreatorCollectionStats: async () => options.stats ?? stats,
      getPhotos: async (query: Record<string, unknown>) => {
        queries.push(query);
        return {
          items: [],
          nextCursor:
            options.nextCursor === undefined ? 60 : options.nextCursor,
        };
      },
    },
    "next/navigation": {
      notFound: () => {
        throw new Error("NOT_FOUND");
      },
      permanentRedirect: (url: string) => {
        throw new Error(`REDIRECT:${url}`);
      },
    },
    "@/components/InfiniteGallery": { InfiniteGallery: Gallery },
  };
  for (const [path, name] of [
    ["VerifiedBadge", "VerifiedBadge"],
    ["Interactions", "FollowButton"],
    ["MediaImg", "MediaImg"],
    ["BackLink", "BackLink"],
    ["FloatingBack", "FloatingBack"],
    ["JsonLd", "JsonLd"],
  ])
    replacements[`@/components/${path}`] = { [name]: () => null };
  const suffix = collection === "overview" ? "" : `/${collection}`;
  const route = loadAppModule<Route>(
    `src/app/(default)/[handle]${suffix}/page.tsx`,
    replacements,
  );
  const props = (search: Search = {}) => ({
    params: Promise.resolve({ handle: "aria-lune-v3" }),
    searchParams: Promise.resolve(search),
  });
  return { route, props, queries, Gallery };
}
function nodes(
  tree: ReactNode,
): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(tree)) return [];
  return [tree, ...nodes(tree.props.children as ReactNode)];
}

test("page 2 requests offset 30 and owns its canonical instead of page 1", async () => {
  const { route, props, queries } = setup();
  const metadata = await route.generateMetadata(props({ page: "2" }));
  assert.equal(metadata.alternates?.canonical, "/aria-lune-v3?page=2");
  await route.default(props({ page: "2" }));
  assert.equal(queries.at(-1)?.cursor, 30);
  assert.equal(queries.at(-1)?.limit, 30);
  assert.equal(queries.at(-1)?.sort, "recent");
});

test("only exact overview legacy filters permanently redirect to clean collections", async () => {
  for (const [search, target] of [
    [{ type: "photo" }, "/aria-lune-v3/photos"],
    [{ type: "video" }, "/aria-lune-v3/videos"],
    [{ sort: "popular" }, "/aria-lune-v3/popular"],
  ] as const) {
    const { route, props } = setup();
    await assert.rejects(route.default(props(search)), {
      message: `REDIRECT:${target}`,
    });
  }
});

test("arbitrary and repeated filters remain usable and noindex,follow", async () => {
  for (const search of [
    { sort: "liked" },
    { type: "video", sort: "liked" },
    { type: "video", cursor: "30" },
    { type: ["photo", "video"] },
    { sort: "popular", extra: "1" },
  ]) {
    const { route, props } = setup();
    const metadata = await route.generateMetadata(props(search));
    assert.equal((metadata.robots as { index: boolean }).index, false);
    assert.equal((metadata.robots as { follow: boolean }).follow, true);
    await route.default(props(search));
  }
});

test("invalid page values are noindex and never request an unsafe offset", async () => {
  for (const page of ["0", "-1", "2x", "10001", ["2", "3"]]) {
    const { route, props, queries } = setup();
    const metadata = await route.generateMetadata(props({ page }));
    assert.equal((metadata.robots as { index: boolean }).index, false);
    await route.default(props({ page }));
    assert.equal(queries.at(-1)?.cursor, 0);
  }
});

test("explicit collections filter/order correctly and expose sequential crawlable HTML links", async () => {
  for (const [collection, type, sort] of [
    ["photos", "photo", "recent"],
    ["videos", "video", "recent"],
    ["popular", undefined, "popular"],
  ] as const) {
    const { route, props, queries, Gallery } = setup(collection);
    const tree = await route.default(props({ page: "2" }));
    assert.deepEqual(queries.at(-1), {
      creator: "aria-lune",
      type,
      sort,
      cursor: 30,
      limit: 30,
    });
    const elements = nodes(tree);
    assert.ok(elements.some((el) => el.type === Gallery));
    assert.ok(
      elements.some(
        (el) => el.props.href === `/aria-lune-v3/${collection}?page=3`,
      ),
    );
    assert.equal(
      (await route.generateMetadata(props({ page: "2" }))).alternates
        ?.canonical,
      `/aria-lune-v3/${collection}?page=2`,
    );
  }
});

test("thresholds hide collection tabs and reject ineligible routes", async () => {
  const lowStats = { ...stats, photoCount: 11, videoCount: 3, engagedCount: 7 };
  for (const collection of ["photos", "videos", "popular"]) {
    const { route, props } = setup(collection, { stats: lowStats });
    await assert.rejects(route.default(props()), { message: "NOT_FOUND" });
    await assert.rejects(route.generateMetadata(props()), {
      message: "NOT_FOUND",
    });
  }
  const { route, props } = setup("overview", { stats: lowStats });
  const hrefs = nodes(await route.default(props())).map((el) => el.props.href);
  assert.ok(!hrefs.includes("/aria-lune-v3/photos"));
  assert.ok(!hrefs.includes("/aria-lune-v3/videos"));
  assert.ok(!hrefs.includes("/aria-lune-v3/popular"));
});

test("removed and obsolete creators stay inaccessible through the shared page and metadata", async () => {
  for (const value of [
    { ...creator, urlVersion: 4 },
    { ...creator, removedFromIndexAt: "2026-10-29" },
  ]) {
    const { route, props } = setup("overview", {
      creator: value as typeof creator,
    });
    await assert.rejects(route.default(props()), { message: "NOT_FOUND" });
    await assert.rejects(route.generateMetadata(props()), {
      message: "NOT_FOUND",
    });
  }
});

test("legacy cursor offsets remain functional, while numbered pages always own their offset", async () => {
  const { route, props, queries } = setup();
  const tree = await route.default(
    props({ cursor: "60", type: "photo", sort: "liked" }),
  );
  assert.equal(queries.at(-1)?.cursor, 60);
  assert.ok(
    nodes(tree).some(
      (el) => el.props.href === "/aria-lune-v3?page=4&type=photo&sort=liked",
    ),
  );
  await route.default(props({ cursor: "60", page: "2", sort: "liked" }));
  assert.equal(queries.at(-1)?.cursor, 30);
});

test("page beyond the known public collection count is noindex", async () => {
  const { route, props } = setup();
  const metadata = await route.generateMetadata(props({ page: "5" }));
  assert.equal((metadata.robots as { index: boolean }).index, false);
  assert.equal(metadata.alternates?.canonical, "/aria-lune-v3?page=5");
});

test("ineligible exact legacy filters are usable noindex instead of redirecting to a 404", async () => {
  const { route, props, queries } = setup("overview", {
    stats: { ...stats, photoCount: 11 },
  });
  await route.default(props({ type: "photo" }));
  assert.equal(queries.at(-1)?.type, "photo");
  const metadata = await route.generateMetadata(props({ type: "photo" }));
  assert.equal((metadata.robots as { index: boolean }).index, false);
});

test("legacy non-aligned offsets preserve a functional cursor link and remain noindex", async () => {
  const { route, props, queries } = setup("overview", { nextCursor: 95 });
  const tree = await route.default(props({ cursor: "65", sort: "liked" }));
  assert.equal(queries.at(-1)?.cursor, 65);
  assert.ok(
    nodes(tree).some(
      (el) => el.props.href === "/aria-lune-v3?sort=liked&cursor=95",
    ),
  );
  assert.equal(
    (
      (await route.generateMetadata(props({ cursor: "65", sort: "liked" })))
        .robots as { index: boolean }
    ).index,
    false,
  );
});
