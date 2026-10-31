import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { buildSitemapPartitions, decodeSitemapCursor } from "../src/lib/sitemap-partitions.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const createdAt = "2026-10-30T01:00:00.000Z";
const id = (n: number) => String(n).padStart(6, "0");
process.env.SESSION_SECRET = "fixture-only-sitemap-signing-key";

test("public clients cannot fabricate or enlarge a fixed interval", () => {
  const fabricated = Buffer.from(JSON.stringify([createdAt, "0", null, null])).toString("base64url");
  assert.equal(decodeSitemapCursor(fabricated), null);
  const [partition] = buildSitemapPartitions([
    { date: "2026-10-30", createdAt, id: id(1), upper: { createdAt, id: id(2001) } },
  ]);
  const changed = JSON.parse(Buffer.from(partition.cursor, "base64url").toString("utf8"));
  changed[3] = id(9999);
  assert.equal(decodeSitemapCursor(Buffer.from(JSON.stringify(changed)).toString("base64url")), null);
});

test("new cursors retain the next physical boundary, including the end of a day", () => {
  const partitions = buildSitemapPartitions([
    { date: "2026-10-30", createdAt, id: id(1), upper: { createdAt, id: id(2001) } },
    { date: "2026-10-30", createdAt, id: id(2001), upper: null },
  ]);
  assert.deepEqual(decodeSitemapCursor(partitions[0].cursor), {
    createdAt, id: id(1), upper: { createdAt, id: id(2001) },
  });
  assert.deepEqual(decodeSitemapCursor(partitions[1].cursor), {
    createdAt, id: id(2001), upper: null,
  });
  const backwards = Buffer.from(JSON.stringify([createdAt, id(2), createdAt, id(1)])).toString("base64url");
  assert.equal(decodeSitemapCursor(backwards), null);
});

test("an intermediate insert cannot evict an old media from cached fixed intervals", async () => {
  const ids = Array.from({ length: 2002 }, (_, n) => id(n + 1));
  ids.splice(1, 0, "000001a");
  const connection = {
    async query(sql: string, params: Array<string | number> = []) {
      if (sql.startsWith("START TRANSACTION")) return [[]];
      const lower = String(params[4]);
      if (sql.includes("SELECT p.created_at, p.id")) {
        const after = ids.filter((value) => value > lower);
        const next = after[Number(params[5])];
        return [next ? [{ id: next, created_at: createdAt }] : []];
      }
      const upper = sql.includes("p.id < ?") ? String(params[7]) : null;
      const limit = Number(params.at(-1));
      return [ids.filter((value) => value >= lower && (!upper || value < upper)).slice(0, limit).map((value) => ({
        id: value, source_id: null, creator_handle: "fixture", url_version: 1,
        updated_at: createdAt, created_at: createdAt, title: "fixture", description: null,
        image_url: "https://example.invalid/fixture.jpg", video_url: null, type: "photo",
        duration_sec: null, views_count: 0,
      }))];
    },
    async commit() {}, async rollback() {}, release() {},
  };
  const data = loadAppModule<{
    getSitemapMediaPartition: (date: string, cursor: string) => Promise<Array<{ id: string }>>;
  }>("src/lib/sitemap-data.ts", {
    "server-only": {},
    "./db-pool": { requireDbPool: () => ({ getConnection: async () => connection }) },
  });
  const partitions = buildSitemapPartitions([
    { date: "2026-10-30", createdAt, id: id(1), upper: { createdAt, id: id(2001) } },
    { date: "2026-10-30", createdAt, id: id(2001), upper: null },
  ]);
  const first = await data.getSitemapMediaPartition("2026-10-30", partitions[0].cursor);
  const second = await data.getSitemapMediaPartition("2026-10-30", partitions[1].cursor);
  assert.equal(first.length, 2001);
  assert.deepEqual([...first, ...second].map((media) => media.id), ids);
  assert.equal(new Set([...first, ...second].map((media) => media.id)).size, ids.length);
});

test("an overflowing fixed interval fails instead of returning a truncated sitemap", async () => {
  const connection = {
    async query(sql: string) {
      return [sql.startsWith("START TRANSACTION") ? [] : Array(50_001).fill({})];
    },
    async commit() {}, async rollback() {}, release() {},
  };
  const data = loadAppModule<{
    getSitemapMediaPartition: (date: string, cursor: string) => Promise<unknown>;
  }>("src/lib/sitemap-data.ts", {
    "server-only": {},
    "./db-pool": { requireDbPool: () => ({ getConnection: async () => connection }) },
  });
  const [partition] = buildSitemapPartitions([
    { date: "2026-10-30", createdAt, id: id(1), upper: null },
  ]);
  await assert.rejects(data.getSitemapMediaPartition("2026-10-30", partition.cursor), /sitemap_partition_capacity_exceeded/);
});

test("the last emitted interval closes at the physical snapshot rather than the end of day", async () => {
  const data = loadAppModule<{
    getSitemapMediaPartitions: () => Promise<Array<{ cursor: string }>>;
  }>("src/lib/sitemap-data.ts", {
    "server-only": {},
    "./db-pool": { requireDbPool: () => ({ query: async () => [[{
      bucket_date: "2026-10-30", created_at: createdAt, id: id(1),
      next_created_at: null, next_id: null, last_created_at: "2026-10-30T02:00:00.000Z",
    }]] }) },
  });
  const [partition] = await data.getSitemapMediaPartitions();
  assert.deepEqual(decodeSitemapCursor(partition.cursor)?.upper, {
    createdAt: "2026-10-30T02:00:00.001Z", id: "0",
  });
});
