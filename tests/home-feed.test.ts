import assert from "node:assert/strict";
import test from "node:test";

async function loadHomeFeed() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/home-feed.ts");
  } catch (error) {
    assert.fail(`home feed ranker is unavailable: ${String(error)}`);
  }
}

type TestPhoto = import("../src/lib/types").PhotoView;

function media(
  id: string,
  overrides: Partial<TestPhoto> = {},
): TestPhoto {
  return {
    id,
    title: id,
    imageUrl: `/media/${id}.jpg`,
    width: 800,
    height: 1000,
    creatorHandle: `creator-${id}`,
    tags: [],
    views: 0,
    likes: 0,
    sourceViews: 1_000,
    sourceLikes: 100,
    localViews: 0,
    ageMinutes: 60,
    trending: 0,
    type: "photo",
    creator: {
      handle: `creator-${id}`,
      name: `Creator ${id}`,
      avatarUrl: "",
      verified: false,
    },
    ...overrides,
  };
}

test("source engagement remains the dominant discovery signal", async () => {
  const { rankHomeFeed } = await loadHomeFeed();
  const ranked = rankHomeFeed(
    [
      media("source-leader", {
        sourceViews: 2_000_000,
        sourceLikes: 90_000,
        ageMinutes: 60 * 24 * 30,
      }),
      media("fresh-small", {
        sourceViews: 100,
        sourceLikes: 5,
        ageMinutes: 1,
        localViews: 50_000,
      }),
    ],
    { seed: 17 },
  );

  assert.equal(ranked[0]?.id, "source-leader");
});

test("freshness decays otherwise equal media", async () => {
  const { rankHomeFeed } = await loadHomeFeed();
  const ranked = rankHomeFeed(
    [
      media("stale", { ageMinutes: 60 * 24 * 90 }),
      media("fresh", { ageMinutes: 5 }),
    ],
    { seed: 23 },
  );

  assert.equal(ranked[0]?.id, "fresh");
});

test("one seed is stable while another varies tied candidates", async () => {
  const { rankHomeFeed } = await loadHomeFeed();
  const tied = Array.from({ length: 12 }, (_, index) => media(`tie-${index}`));
  const first = rankHomeFeed(tied, { seed: 101 }).map((item: { id: string }) => item.id);
  const again = rankHomeFeed(tied, { seed: 101 }).map((item: { id: string }) => item.id);
  const other = rankHomeFeed(tied, { seed: 202 }).map((item: { id: string }) => item.id);

  assert.deepEqual(first, again);
  assert.notDeepEqual(first, other);
});

test("no creator owns more than two of the first 24 when alternatives exist", async () => {
  const { rankHomeFeed } = await loadHomeFeed();
  const dominant = Array.from({ length: 20 }, (_, index) =>
    media(`dominant-${index}`, {
      creatorHandle: "dominant",
      sourceViews: 1_000_000 - index,
      creator: { handle: "dominant", name: "Dominant", avatarUrl: "", verified: false },
    }),
  );
  const alternatives = Array.from({ length: 30 }, (_, index) =>
    media(`alternative-${index}`, {
      creatorHandle: `alternative-${index}`,
      sourceViews: 50_000 - index,
    }),
  );

  const first24 = rankHomeFeed([...dominant, ...alternatives], { seed: 7 }).slice(0, 24);
  const counts = new Map<string, number>();
  for (const item of first24) {
    counts.set(item.creatorHandle, (counts.get(item.creatorHandle) ?? 0) + 1);
  }

  assert.ok(Math.max(...counts.values()) <= 2);
});

test("the first discovery window includes both photos and videos when available", async () => {
  const { rankHomeFeed } = await loadHomeFeed();
  const photos = Array.from({ length: 20 }, (_, index) =>
    media(`photo-${index}`, { sourceViews: 100_000 - index }),
  );
  const videos = Array.from({ length: 3 }, (_, index) =>
    media(`video-${index}`, {
      type: "video",
      sourceViews: 5_000 - index,
    }),
  );

  const types = new Set(
    rankHomeFeed([...photos, ...videos], { seed: 31 })
      .slice(0, 8)
      .map((item: { type: string }) => item.type),
  );

  assert.deepEqual([...types].sort(), ["photo", "video"]);
});

test("already-seen IDs never reappear", async () => {
  const { rankHomeFeed } = await loadHomeFeed();
  const ranked = rankHomeFeed(
    [media("seen"), media("new-1"), media("new-2")],
    { seed: 1, seenIds: new Set(["seen"]) },
  );

  assert.deepEqual(
    ranked.map((item: { id: string }) => item.id).sort(),
    ["new-1", "new-2"],
  );
});
