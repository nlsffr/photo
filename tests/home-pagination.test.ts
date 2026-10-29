import assert from "node:assert/strict";
import test from "node:test";

async function loadHomeFeed() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/home-feed.ts");
  } catch (error) {
    assert.fail(`home pagination helpers are unavailable: ${String(error)}`);
  }
}

const item = (id: string) => ({ id });

test("home seeds preserve valid values and create bounded replacements", async () => {
  const { resolveHomeSeed } = await loadHomeFeed();
  let calls = 0;
  const create = () => {
    calls += 1;
    return 4_294_967_300;
  };

  assert.equal(resolveHomeSeed(123.9, create), 123);
  assert.equal(calls, 0);
  assert.equal(resolveHomeSeed(Number.NaN, create), 4);
  assert.equal(calls, 1);
});

test("stable cursor pages never repeat duplicate candidate IDs", async () => {
  const { paginateHomeFeed } = await loadHomeFeed();
  const ranked = [item("a"), item("b"), item("b"), item("c"), item("d")];

  const first = paginateHomeFeed(ranked, { cursor: 0, limit: 2, seed: 77 });
  const second = paginateHomeFeed(ranked, {
    cursor: first.nextCursor,
    limit: 2,
    seed: first.seed,
  });

  assert.deepEqual(first.items.map((entry: { id: string }) => entry.id), ["a", "b"]);
  assert.deepEqual(second.items.map((entry: { id: string }) => entry.id), ["c", "d"]);
  assert.equal(first.nextCursor, 2);
  assert.equal(second.nextCursor, null);
  assert.equal(first.seed, 77);
  assert.equal(second.seed, 77);
});

test("load-more append keeps existing order and ignores repeated IDs", async () => {
  const { appendUniqueHomeItems } = await loadHomeFeed();

  assert.deepEqual(
    appendUniqueHomeItems(
      [item("a"), item("b")],
      [item("b"), item("c"), item("c"), item("d")],
    ).map((entry: { id: string }) => entry.id),
    ["a", "b", "c", "d"],
  );
});
