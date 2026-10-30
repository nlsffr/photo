import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";
import type { Creator, Photo } from "../src/lib/types";

type Provider = {
  getCreator(handle: string): Promise<Creator | undefined>;
  getPhoto(id: string): Promise<Photo | undefined>;
};

test("direct creator and media lookups carry hidden gates before returning public data", async () => {
  const calls: string[] = [];
  const pool = {
    execute: async (sql: string) => { calls.push(sql); return [[], []]; },
  };
  const { MariaDBProvider } = loadAppModule<{ MariaDBProvider: new () => Provider }>(
    "src/lib/providers/mariadb.ts",
    { "../db-pool": { requireDbPool: () => pool } },
  );
  const provider = new MariaDBProvider();
  assert.equal(await provider.getCreator("hidden-profile"), undefined);
  assert.match(calls[0], /c\.handle = :handle/);
  assert.match(calls[0], /c\.is_hidden = 0/);

  for (const id of ["123", "internal-photo-id"]) {
    assert.equal(await provider.getPhoto(id), undefined);
    const sql = calls.at(-1)!;
    assert.match(sql, /p\.is_hidden = 0/);
    assert.match(sql, /c\.is_hidden = 0/);
  }
});

test("discovery filters hidden rows inside every bounded candidate arm", () => {
  const { buildPhotoListPlan } = loadAppModule<{
    buildPhotoListPlan: (options: { sort: "discover" }) => { fromSql: string };
  }>("src/lib/providers/photo-query-plan.ts");
  const { fromSql } = buildPhotoListPlan({ sort: "discover" });
  for (const alias of ["pv", "cv", "pl", "cl", "pr", "cr"]) {
    assert.match(fromSql, new RegExp(`${alias}\\.is_hidden = 0`));
  }
});

test("sitemap boundaries keep physical positions but do not publish hidden partitions or rows", () => {
  const { SITEMAP_PARTITION_BOUNDARIES_SQL, SITEMAP_NEXT_BOUNDARY_SQL, sitemapPartitionMediaSql } = loadAppModule<{
    SITEMAP_PARTITION_BOUNDARIES_SQL: string;
    SITEMAP_NEXT_BOUNDARY_SQL: string;
    sitemapPartitionMediaSql: (bounded: boolean) => string;
  }>("src/lib/sitemap-query.ts");
  const eligible = SITEMAP_PARTITION_BOUNDARIES_SQL.split("THEN 1 ELSE 0")[0];
  for (const alias of ["p", "c"]) {
    assert.match(eligible, new RegExp(`${alias}\\.is_hidden = 0`));
    assert.match(sitemapPartitionMediaSql(true), new RegExp(`${alias}\\.is_hidden = 0`));
  }
  assert.doesNotMatch(SITEMAP_NEXT_BOUNDARY_SQL, /is_hidden|removed_from_index_at/);
});
