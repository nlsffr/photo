import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
const policyPromise = import("../src/lib/creator-collections.ts");

test("collection eligibility follows the public-content thresholds", async () => {
  const { collectionIsEligible } = await policyPromise;
  const cases = [
    ["overview", { mediaCount: 1 }, true], ["overview", { mediaCount: 0 }, false],
    ["photos", { photoCount: 12 }, true], ["photos", { photoCount: 11 }, false],
    ["videos", { videoCount: 4 }, true], ["videos", { videoCount: 3 }, false],
    ["popular", { mediaCount: 24, engagedCount: 8 }, true],
    ["popular", { mediaCount: 24, engagedCount: 7 }, false],
    ["popular", { mediaCount: 23, engagedCount: 8 }, false],
  ] as const;
  for (const [collection, stats, expected] of cases) assert.equal(collectionIsEligible(collection, stats as never), expected);
});

test("parses collection routes safely, including localized and versioned handles", async () => {
  const { isRoutableCreatorHandle, parseCreatorCollectionPath } = await policyPromise;
  for (const path of [
    "/alice/photos",
    "/en/alice/photos",
    "/fr/alice-v3/videos",
    "/tina_kitsune/photos",
    "/en/little.warren/videos",
    "/fr/___evasavagiou/popular",
    "/blackmagicmodel.../photos",
  ]) assert.ok(parseCreatorCollectionPath(path), path);
  assert.deepEqual(parseCreatorCollectionPath("/alice"), { handle: "alice", collection: "overview" });
  assert.deepEqual(parseCreatorCollectionPath("/en/alice"), { handle: "alice", collection: "overview" });
  assert.deepEqual(parseCreatorCollectionPath("/fr/alice-v3"), { handle: "alice-v3", collection: "overview" });
  for (const handle of [
    "contact", "models", "sitemaps", "en", "fr", "es", "de", "it", "pt", "nl", "photos", "videos", "popular",
    "api", "creator", "photo", "media", "_next", "saved", "liked", "search",
    "random", "tag",
  ]) {
    assert.equal(isRoutableCreatorHandle(handle), false, handle);
    assert.equal(parseCreatorCollectionPath(`/${handle}`), null, handle);
    assert.equal(parseCreatorCollectionPath(`/${handle}/photos`), null, `${handle}/photos`);
  }
  assert.equal(isRoutableCreatorHandle("foo-v2"), false);
  for (const handle of ["tina_kitsune", "little.warren", "blackmagicmodel...", "emiru.jpg"]) {
    assert.equal(isRoutableCreatorHandle(handle), true, handle);
  }
  assert.deepEqual(parseCreatorCollectionPath("/alice-v2/photos"), { handle: "alice-v2", collection: "photos" });
  assert.deepEqual(parseCreatorCollectionPath("/foo-v2"), { handle: "foo-v2", collection: "overview" });
  assert.deepEqual(parseCreatorCollectionPath("/alice-V2/photos"), { handle: "alice-V2", collection: "photos" });
  assert.equal(parseCreatorCollectionPath("/contact-v2/photos"), null);
  assert.equal(parseCreatorCollectionPath("/en/contact"), null);
  for (const path of [
    "/photos/videos",
    "/alice/unknown",
    "/%E0%A4%A/photos",
    "/photos/photos",
    "/alice-v0/popular",
    "/./photos",
    "/../photos",
    "/alice%2Fbob/photos",
    `/${"a".repeat(101)}/photos`,
  ]) assert.equal(parseCreatorCollectionPath(path), null, path);
});

test("parses safe page numbers and builds localized versioned canonical paths", async () => {
  const { parseCreatorPage, creatorCollectionPath } = await policyPromise;
  for (const raw of [undefined, "", "1"]) assert.deepEqual(parseCreatorPage(raw), { page: 1, valid: true });
  for (const raw of ["0", "-1", "1.2", "10001", "abc"]) assert.equal(parseCreatorPage(raw).valid, false);
  assert.equal(creatorCollectionPath("alice", 1, "photos"), "/alice/photos");
  assert.equal(creatorCollectionPath("alice", 1, "overview"), "/alice");
  assert.equal(creatorCollectionPath("alice", 1, "overview", "en"), "/en/alice");
  assert.equal(creatorCollectionPath("alice", 1, "overview", "fr"), "/fr/alice");
  assert.equal(creatorCollectionPath("alice", 3, "overview", "fr", 2), "/fr/alice-v3?page=2");
  assert.equal(creatorCollectionPath("alice", 3, "photos", "fr", 1), "/fr/alice-v3/photos");
  assert.equal(creatorCollectionPath("alice", 3, "photos", "en", 2), "/en/alice-v3/photos?page=2");
  assert.equal(creatorCollectionPath("tina_kitsune", 1, "overview", "en"), "/en/tina_kitsune");
  assert.equal(creatorCollectionPath("little.warren", 1, "photos", "fr"), "/fr/little.warren/photos");
  for (const handle of [".", "..", "alice/bob", "alice%2Fbob", "a".repeat(101), "contact", "models", "sitemaps", "en", "fr", "photos", "videos", "popular", "api", "creator", "photo", "media", "_next", "saved", "liked", "search", "random", "tag", "foo-v2"]) {
    assert.throws(() => creatorCollectionPath(handle, 1, "overview"), /Invalid creator handle/, handle);
  }
  assert.equal(creatorCollectionPath("alice-V2", 1, "overview"), "/alice-V2");
});

test("summarizes media counts and engagement", async () => {
  const { summarizeCreatorCollectionStats } = await policyPromise;
  assert.deepEqual(summarizeCreatorCollectionStats([
    { type: "photo", views: 0, likes: 0, sourceViews: 1 }, { type: "video", views: 0, likes: 0, sourceLikes: 3 }, { type: "pack", views: 5, likes: 2 },
  ]), { mediaCount: 3, photoCount: 1, videoCount: 1, engagedCount: 2, totalViews: 5, totalLikes: 2 });
});
