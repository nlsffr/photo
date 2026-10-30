import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadSnapshots() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/home-feed-snapshot.ts");
  } catch (error) {
    assert.fail(`home feed snapshot helpers are unavailable: ${String(error)}`);
  }
}

test("a discovery session keeps one frozen ID order while the live pool changes", async () => {
  const { createHomeFeedSnapshotStore, homeFeedSnapshotKey } = await loadSnapshots();
  let now = 1_000;
  const store = createHomeFeedSnapshotStore({
    maxEntries: 4,
    ttlMs: 60_000,
    now: () => now,
  });
  const key = homeFeedSnapshotKey({ seed: 77, type: "video", tag: "portrait" });
  const initialRanking = ["a", "b", "c", "d"];
  store.set(key, initialRanking);
  initialRanking.unshift("new-live-item");

  const first = store.get(key)?.slice(0, 2);
  now += 5_000;
  const livePoolAfterPageOne = ["x", "y", "a", "b", "c", "d"];
  assert.deepEqual(livePoolAfterPageOne.slice(2, 4), ["a", "b"]);
  const second = store.get(key)?.slice(2, 4);

  assert.deepEqual(first, ["a", "b"]);
  assert.deepEqual(second, ["c", "d"]);
});

test("snapshots expire and evict least-recently-used sessions", async () => {
  const { createHomeFeedSnapshotStore } = await loadSnapshots();
  let now = 0;
  const store = createHomeFeedSnapshotStore({
    maxEntries: 2,
    ttlMs: 100,
    now: () => now,
  });
  store.set("one", ["a"]);
  store.set("two", ["b"]);
  assert.deepEqual(store.get("one"), ["a"]);
  store.set("three", ["c"]);

  assert.equal(store.get("two"), undefined);
  assert.deepEqual(store.get("one"), ["a"]);
  now = 101;
  assert.equal(store.get("one"), undefined);
});

test("MariaDB discovery reuses the frozen session before querying a live pool", async () => {
  const source = await readFile(
    new URL("../src/lib/providers/mariadb.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /homeFeedSnapshots\.get\(snapshotKey\)/);
  assert.match(source, /homeFeedSnapshots\.set\(snapshotKey/);
  assert.match(source, /discoveryPageFromSnapshot/);
  assert.ok(
    source.indexOf("homeFeedSnapshots.get(snapshotKey)") <
      source.indexOf("LIMIT ${discovery ? 1200"),
    "a cached session must bypass the mutable candidate query",
  );
});
