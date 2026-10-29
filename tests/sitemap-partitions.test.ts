import assert from "node:assert/strict";
import test from "node:test";

async function loadPartitions() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit suffix.
    return await import("../src/lib/sitemap-partitions.ts");
  } catch (error) {
    assert.fail(`sitemap partition policy is unavailable: ${String(error)}`);
  }
}

const closedBoundaries = [
  {
    date: "2026-10-27",
    createdAt: "2026-10-27T00:00:01.000Z",
    id: "00000000-0000-0000-0000-000000000001",
  },
  {
    date: "2026-10-27",
    createdAt: "2026-10-27T14:12:04.000Z",
    id: "00000000-0000-0000-0000-000000010001",
  },
  {
    date: "2026-10-28",
    createdAt: "2026-10-28T00:00:03.000Z",
    id: "00000000-0000-0000-0000-000000020001",
  },
];

test("a newer date never renames partitions in closed date buckets", async () => {
  const { buildSitemapPartitions } = await loadPartitions();
  const before = buildSitemapPartitions(closedBoundaries);
  const after = buildSitemapPartitions([
    ...closedBoundaries,
    {
      date: "2026-10-29",
      createdAt: "2026-10-29T09:30:00.000Z",
      id: "00000000-0000-0000-0000-000000030001",
    },
  ]);

  const oldPaths = before.map((partition: { path: string }) => partition.path);
  assert.deepEqual(
    after
      .filter((partition: { date: string }) => partition.date !== "2026-10-29")
      .map((partition: { path: string }) => partition.path),
    oldPaths,
  );
  assert.equal(new Set(after.map((partition: { path: string }) => partition.path)).size, 4);
});

test("partition cursors are URL-safe and preserve the exact keyset boundary", async () => {
  const { buildSitemapPartitions, decodeSitemapCursor } = await loadPartitions();
  const [partition] = buildSitemapPartitions([closedBoundaries[0]]);

  assert.match(
    partition.path,
    /^\/sitemaps\/media\/2026-10-27\/[A-Za-z0-9_-]+$/,
  );
  assert.deepEqual(decodeSitemapCursor(partition.cursor), {
    createdAt: "2026-10-27T00:00:01.000Z",
    id: "00000000-0000-0000-0000-000000000001",
  });
});

test("malformed dates and cursors fail closed", async () => {
  const { buildSitemapPartitions, decodeSitemapCursor } = await loadPartitions();

  assert.throws(
    () => buildSitemapPartitions([{ ...closedBoundaries[0], date: "2026-02-31" }]),
    /date/i,
  );
  assert.equal(decodeSitemapCursor("not-a-real-cursor"), null);
});

test("UTC keysets are converted to unambiguous MariaDB timestamp literals", async () => {
  const { toMariaDbUtcTimestamp } = await loadPartitions();

  assert.equal(
    toMariaDbUtcTimestamp("2026-10-27T14:12:04.123Z"),
    "2026-10-27 14:12:04.123",
  );
  assert.throws(() => toMariaDbUtcTimestamp("not-a-date"), /timestamp/i);
});
