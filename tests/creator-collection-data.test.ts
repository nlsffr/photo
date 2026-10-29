import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error Runtime Node 24 exposes registerHooks; installed Node types predate it.
import { registerHooks } from "node:module";
import test from "node:test";
import type { Photo } from "../src/lib/types";

// Run the real providers under native Node stripping, resolving bundler imports.
registerHooks({ resolve(specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => { url: string }) {
  return nextResolve(specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
// @ts-expect-error Native Node requires explicit .ts suffixes.
const demo = import("../src/lib/providers/demo.ts");
// @ts-expect-error Native Node requires explicit .ts suffixes.
const policy = import("../src/lib/creator-collections.ts");
const zero = { mediaCount: 0, photoCount: 0, videoCount: 0, engagedCount: 0, totalViews: 0, totalLikes: 0 };

function fixture(id: string, type: Photo["type"], sourceViews = 0, sourceLikes = 0): Photo {
  return { id, type, title: id, imageUrl: "/fixture.jpg", width: 100, height: 100, creatorHandle: "fixture", tags: [], views: sourceViews + 10, likes: sourceLikes, sourceViews, sourceLikes, ageMinutes: 0, trending: 0 };
}

test("real summarizer distinguishes media types and imported engagement", async () => {
  const { summarizeCreatorCollectionStats } = await policy;
  assert.deepEqual(summarizeCreatorCollectionStats([
    fixture("photo", "photo", 20), fixture("video", "video", 0, 3), fixture("pack", "pack"), fixture("local-only", "photo"),
  ]), { mediaCount: 4, photoCount: 2, videoCount: 1, engagedCount: 2, totalViews: 60, totalLikes: 3 });
});

test("demo aggregate uses its complete real corpus, with packs counted as media", async () => {
  const provider = new (await demo).DemoProvider();
  assert.deepEqual(await provider.getCreatorCollectionStats("aria-lune"), {
    mediaCount: 5, photoCount: 1, videoCount: 2, engagedCount: 5, totalViews: 1020272, totalLikes: 134414,
  });
  const totals = { ...zero };
  for (const creator of await provider.getCreators()) {
    const stats = await provider.getCreatorCollectionStats(creator.handle);
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] += stats[key];
  }
  assert.deepEqual(totals, { mediaCount: 140, photoCount: 85, videoCount: 31, engagedCount: 140, totalViews: 35544656, totalLikes: 2802370 });
  assert.deepEqual(await provider.getCreatorCollectionStats("missing"), zero);
});

test("removed demo media and creators never contribute, including after an earlier read", async () => {
  const provider = new (await demo).DemoProvider();
  const creator = (await provider.getCreator("aria-lune"))!;
  const views = (await provider.getAllPhotos()).filter((photo: Photo) => photo.creatorHandle === creator.handle);
  const photo = (await provider.getPhoto(views[0].id))!;
  const { summarizeCreatorCollectionStats } = await policy;
  try {
    await provider.getCreatorCollectionStats(creator.handle);
    photo.removedFromIndexAt = "2026-10-29T00:00:00Z";
    assert.deepEqual(await provider.getCreatorCollectionStats(creator.handle), summarizeCreatorCollectionStats(views.filter((item: Photo) => item.id !== photo.id)));
    creator.removedFromIndexAt = "2026-10-29T00:00:00Z";
    assert.deepEqual(await provider.getCreatorCollectionStats(creator.handle), zero);
  } finally {
    delete photo.removedFromIndexAt;
    delete creator.removedFromIndexAt;
  }
});

test("existing demo collection filters preserve recent and popular ordering", async () => {
  const provider = new (await demo).DemoProvider();
  for (const query of [{ sort: "recent" }, { sort: "recent", type: "photo" }, { sort: "recent", type: "video" }, { sort: "popular" }] as const) {
    const page = await provider.getPhotos({ ...query, creator: "aria-lune", limit: 100 });
    assert.ok(page.items.length > 0);
    assert.ok(page.items.every((item: Photo) => item.creatorHandle === "aria-lune" && (!("type" in query) || item.type === query.type)));
    for (let i = 1; i < page.items.length; i++) {
      assert.ok(query.sort === "popular" ? page.items[i - 1].views >= page.items[i].views : page.items[i - 1].ageMinutes <= page.items[i].ageMinutes);
    }
  }
});

test("public aggregate wrapper uses React request cache and normalizes versioned handles", async () => {
  const source = await readFile(new URL("../src/lib/photos.ts", import.meta.url), "utf8");
  assert.match(source, /export const getCreatorCollectionStats = cache\(async \(handle: string\)/);
  const wrapper = source.slice(source.indexOf("export const getCreatorCollectionStats"), source.indexOf("export async function searchCreators"));
  assert.match(wrapper, /parseVersionedSlug\(handle\)/);
  assert.match(wrapper, /getCreatorCollectionStats\(base\)/);
  assert.doesNotMatch(wrapper, /createAsyncTtlCache|unstable_cache|new Map|use cache/);
});

test("demo combined context includes zero-public-media creators and excludes removed creators", async () => {
  const provider = new (await demo).DemoProvider();
  const creator = (await provider.getCreator("aria-lune"))!;
  const items = (await provider.getAllPhotos()).filter((item: Photo) => item.creatorHandle === creator.handle);
  const media = await Promise.all(items.map((item: Photo) => provider.getPhoto(item.id)));
  assert.equal(typeof provider.getCreatorCollectionContext, "function", "combined context provider is required");
  const context = await provider.getCreatorCollectionContext("aria-lune");
  assert.equal(context?.creator.handle, "aria-lune");
  assert.deepEqual(context?.stats, { mediaCount: 5, photoCount: 1, videoCount: 2, engagedCount: 5, totalViews: 1020272, totalLikes: 134414 });
  try {
    for (const item of media) item!.removedFromIndexAt = "2026-10-29";
    assert.deepEqual((await provider.getCreatorCollectionContext("aria-lune"))?.stats, zero);
    creator.removedFromIndexAt = "2026-10-29";
    assert.equal(await provider.getCreatorCollectionContext("aria-lune"), undefined);
    assert.equal(await provider.getCreatorCollectionContext("missing"), undefined);
  } finally {
    for (const item of media) delete item!.removedFromIndexAt;
    delete creator.removedFromIndexAt;
  }
});
