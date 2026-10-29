import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadQueryPlan() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/providers/photo-query-plan.ts");
  } catch (error) {
    assert.fail(`photo query plan is unavailable: ${String(error)}`);
  }
}

test("popular media pages use the ordered index without a filesort", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const plan = buildPhotoListPlan({ sort: "popular" });

  assert.equal(plan.indexName, "idx_photos_views_id");
  assert.equal(plan.orderBy, "p.views_count DESC, p.id ASC");
  assert.match(plan.fromSql, /FORCE INDEX \(idx_photos_views_id\)/);
  assert.match(plan.fromSql, /STRAIGHT_JOIN creators c/);
});

test("recent and liked media pages preserve the matching index direction", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();

  assert.deepEqual(buildPhotoListPlan({ sort: "recent" }), {
    indexName: "idx_photos_created_id",
    fromSql:
      "FROM photos p FORCE INDEX (idx_photos_created_id) STRAIGHT_JOIN creators c ON c.id = p.creator_id",
    extraWhere: null,
    orderBy: "p.created_at DESC, p.id ASC",
    params: {},
  });
  assert.equal(
    buildPhotoListPlan({ sort: "liked" }).orderBy,
    "p.likes_count DESC, p.id ASC",
  );
});

test("random media pages use a stable seed-derived UUID pivot instead of RAND", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const first = buildPhotoListPlan({ sort: "random", seed: 12345 });
  const again = buildPhotoListPlan({ sort: "random", seed: 12345 });
  const other = buildPhotoListPlan({ sort: "random", seed: 54321 });

  assert.deepEqual(first, again, "one seed must keep pagination stable");
  assert.notEqual(first.params.randomPivot, other.params.randomPivot);
  assert.match(
    String(first.params.randomPivot),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  assert.doesNotMatch(first.orderBy, /RAND/i);

  const plans = Array.from({ length: 64 }, (_, seed) =>
    buildPhotoListPlan({ sort: "random", seed }),
  );
  const ascending = plans.find((plan) => plan.orderBy === "p.id ASC");
  const descending = plans.find((plan) => plan.orderBy === "p.id DESC");
  assert.equal(ascending?.extraWhere, "p.id >= :randomPivot");
  assert.equal(descending?.extraWhere, "p.id <= :randomPivot");
});

test("global trending pages rank a bounded union of indexed candidates", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const plan = buildPhotoListPlan({ sort: "trending" });

  assert.match(plan.fromSql, /idx_photos_views_id/);
  assert.match(plan.fromSql, /idx_photos_created_id/);
  assert.match(plan.fromSql, /idx_photos_likes_id/);
  assert.match(plan.fromSql, /LIMIT 500/);
  assert.match(plan.fromSql, /STRAIGHT_JOIN photos p ON p\.id = candidates\.id/);
  assert.match(plan.orderBy, /TIMESTAMPDIFF/);
});

test("discovery reads a bounded indexed union of source views, source likes, and recent media", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const plan = buildPhotoListPlan({ sort: "discover" });

  assert.match(plan.fromSql, /idx_photos_source_views_id/);
  assert.match(plan.fromSql, /source_views_count DESC/);
  assert.match(plan.fromSql, /idx_photos_source_likes_id/);
  assert.match(plan.fromSql, /source_likes_count DESC/);
  assert.match(plan.fromSql, /idx_photos_created_id/);
  assert.equal((plan.fromSql.match(/LIMIT 400/g) ?? []).length, 3);
  assert.match(plan.fromSql, /STRAIGHT_JOIN photos p ON p\.id = candidates\.id/);
  for (const [photo, creator] of [["pv", "cv"], ["pl", "cl"], ["pr", "cr"]]) {
    assert.match(plan.fromSql, new RegExp(`${photo}\\.removed_from_index_at IS NULL`));
    assert.match(plan.fromSql, new RegExp(`${creator}\\.removed_from_index_at IS NULL`));
  }
  assert.doesNotMatch(`${plan.fromSql}\n${plan.orderBy}`, /RAND\s*\(/i);
});

test("discovery applies every active filter inside each bounded candidate arm", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const plan = buildPhotoListPlan({
    sort: "discover",
    discoveryFilters: {
      creator: "creator-a",
      type: "video",
      tag: "portrait",
      legacyTag: "%portrait%",
      isAi: false,
    },
  });

  assert.equal((plan.fromSql.match(/\.type = :type/g) ?? []).length, 3);
  assert.equal((plan.fromSql.match(/\.handle = :creator/g) ?? []).length, 3);
  assert.equal(
    (plan.fromSql.match(/FROM photo_tags \w+t FORCE INDEX \(idx_photo_tags_tag_id\)/g) ?? []).length,
    3,
  );
  assert.equal(
    (plan.fromSql.match(/STRAIGHT_JOIN photos \w+ ON \w+\.id = \w+t\.photo_id/g) ?? []).length,
    3,
  );
  assert.doesNotMatch(plan.fromSql, /EXISTS \(SELECT 1 FROM photo_tags/);
  assert.equal((plan.fromSql.match(/COALESCE\([^)]*\.is_ai, 0\) = :isAi/g) ?? []).length, 3);
  assert.deepEqual(plan.params, {
    creator: "creator-a",
    type: "video",
    tag: "portrait",
    legacyTag: "%portrait%",
    isAi: 0,
  });

  const provider = await readFile(
    new URL("../src/lib/providers/mariadb.ts", import.meta.url),
    "utf8",
  );
  assert.match(provider, /activeMediaSql\("p", "c"\)/);
});

test("empty or sparse pack discovery starts from the type index", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const plan = buildPhotoListPlan({
    sort: "discover",
    discoveryFilters: { type: "pack" },
  });

  assert.equal(
    (plan.fromSql.match(/FORCE INDEX \(idx_type\)/g) ?? []).length,
    3,
  );
  assert.doesNotMatch(plan.fromSql, /idx_photos_source_(views|likes)_id/);
  assert.doesNotMatch(plan.fromSql, /idx_photos_created_id/);
  assert.equal((plan.fromSql.match(/\.type = :type/g) ?? []).length, 3);
  assert.equal(plan.params.type, "pack");
});

test("text search ranks a bounded candidate set including matching creators", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const plan = buildPhotoListPlan({
    sort: "popular",
    selectiveFilter: true,
    textSearch: true,
  });

  assert.match(plan.fromSql, /idx_photos_views_id/);
  assert.match(plan.fromSql, /idx_photos_created_id/);
  assert.match(plan.fromSql, /pt\.title LIKE :q/);
  assert.match(plan.fromSql, /cs\.handle LIKE :q/);
  assert.match(plan.fromSql, /LIMIT 500/);
  assert.match(plan.fromSql, /STRAIGHT_JOIN photos p ON p\.id = candidates\.id/);
});

test("text search stays bounded even when random sorting is requested", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const plan = buildPhotoListPlan({
    sort: "random",
    seed: 42,
    selectiveFilter: true,
    textSearch: true,
  });

  assert.match(plan.fromSql, /pt\.title LIKE :q/);
  assert.equal(plan.extraWhere, null);
  assert.equal(plan.params.randomPivot, undefined);
});

test("filtered searches keep the optimizer free to choose their selective index", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const plan = buildPhotoListPlan({ sort: "popular", selectiveFilter: true });

  assert.equal(plan.indexName, null);
  assert.equal(
    plan.fromSql,
    "FROM photos p JOIN creators c ON c.id = p.creator_id",
  );
  assert.equal(plan.orderBy, "p.views_count DESC, p.id ASC");
});

test("longest media pages use the duration index without a computed sort", async () => {
  const { buildPhotoListPlan } = await loadQueryPlan();
  const plan = buildPhotoListPlan({ sort: "longest" });

  assert.equal(plan.indexName, "idx_photos_duration");
  assert.equal(plan.orderBy, "p.duration_sec DESC, p.id DESC");
  assert.match(plan.fromSql, /FORCE INDEX \(idx_photos_duration\)/);
  assert.doesNotMatch(plan.orderBy, /COALESCE/i);
});

test("creator collection stats execute one bounded public aggregate and normalize numeric counts", async () => {
  // @ts-expect-error Runtime Node 24 exposes registerHooks; installed Node types predate it.
  const { registerHooks } = await import("node:module");
  const hooks = registerHooks({ resolve(specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => { url: string }) {
    if (specifier === "../db-pool") return { url: "data:text/javascript,export function requireDbPool(){throw new Error('Unexpected database connection')}", shortCircuit: true };
    return nextResolve(specifier.startsWith(".") && !/\.[a-z]+$/.test(specifier) ? `${specifier}.ts` : specifier, context);
  } });
  try {
    // @ts-expect-error Native Node requires explicit .ts suffixes.
    const { MariaDBProvider } = await import("../src/lib/providers/mariadb.ts");
    // @ts-expect-error Native Node requires explicit .ts suffixes.
    const { activeMediaSql } = await import("../src/lib/providers/active-content-sql.ts");
    const provider = Object.create(MariaDBProvider.prototype);
    const calls: Array<{ sql: string; params: unknown }> = [];
    let result = [{ mediaCount: "4", photoCount: "2", videoCount: "1", engagedCount: "2", totalViews: "60", totalLikes: "3" }];
    provider.q = async (sql: string, params: unknown) => { calls.push({ sql, params }); return result; };
    assert.deepEqual(await provider.getCreatorCollectionStats("aria-lune"), { mediaCount: 4, photoCount: 2, videoCount: 1, engagedCount: 2, totalViews: 60, totalLikes: 3 });
    assert.equal(calls.length, 1);
    const { sql, params } = calls[0];
    assert.match(sql, /SET STATEMENT max_statement_time=5 FOR/);
    assert.match(sql, /JOIN creators c ON c.id = p.creator_id/);
    assert.ok(sql.includes(activeMediaSql("p", "c")));
    assert.match(sql, /c.handle = :handle/);
    assert.match(sql, /COUNT\(\*\) AS mediaCount/);
    assert.match(sql, /p.type = 'photo'/);
    assert.match(sql, /p.type = 'video'/);
    assert.match(sql, /p.source_views_count[^\n]*> 0 OR[^\n]*p.source_likes_count[^\n]*> 0/);
    assert.equal((sql.match(/\bSELECT\b/g) ?? []).length, 1);
    assert.doesNotMatch(sql, /creator_media_stats|GROUP BY|LIMIT/);
    assert.deepEqual(params, { handle: "aria-lune" });
    result = [{ mediaCount: "0", photoCount: null, videoCount: null, engagedCount: null, totalViews: null, totalLikes: null }] as never;
    assert.deepEqual(await provider.getCreatorCollectionStats("empty-or-removed"), { mediaCount: 0, photoCount: 0, videoCount: 0, engagedCount: 0, totalViews: 0, totalLikes: 0 });
  } finally { hooks.deregister(); }
});

// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";
import type { Creator, CreatorCollectionStats } from "../src/lib/types";

test("combined creator context crosses the real pool boundary once with active outer creator and left-joined public media", async () => {
  const calls: Array<{ sql: string; params: unknown }> = [];
  const rawCreator = { handle: "aria-lune", name: "Aria Lune", avatar_url: "/avatar.jpg", cover_url: null, bio: "Public creator", location: "Paris", followers_count: "123", verified: 1, url_version: 3, updated_at: null, removed_from_index_at: null };
  let rows: Record<string, unknown>[] = [{ ...rawCreator, mediaCount: "24", photoCount: "12", videoCount: "4", engagedCount: "8", totalViews: "400", totalLikes: "30" }];
  const pool = { execute: async (sql: string, params: unknown) => { calls.push({ sql, params }); return [rows, []]; } };
  const { MariaDBProvider } = loadAppModule<{ MariaDBProvider: new () => { getCreatorCollectionContext: (handle: string) => Promise<{ creator: Creator; stats: CreatorCollectionStats } | undefined> } }>("src/lib/providers/mariadb.ts", { "../db-pool": { requireDbPool: () => pool } });
  const provider = new MariaDBProvider();
  assert.equal(typeof provider.getCreatorCollectionContext, "function", "combined SQL context is required");
  const context = await provider.getCreatorCollectionContext("aria-lune");
  assert.equal(calls.length, 1, "context must use one driver execution, including metadata and counters");
  assert.equal(context?.creator.handle, "aria-lune");
  assert.equal(context?.creator.followers, 123);
  assert.equal(context?.creator.urlVersion, 3);
  assert.deepEqual(context?.stats, { mediaCount: 24, photoCount: 12, videoCount: 4, engagedCount: 8, totalViews: 400, totalLikes: 30 });
  const { sql, params } = calls[0];
  assert.match(sql, /SET STATEMENT max_statement_time=5 FOR/);
  assert.match(sql, /FROM creators c\s+LEFT JOIN photos p/);
  assert.match(sql, /ON p.creator_id = c.id\s+AND p.removed_from_index_at IS NULL AND c.removed_from_index_at IS NULL/);
  assert.match(sql, /WHERE c.handle = :handle\s+AND c.removed_from_index_at IS NULL/);
  assert.match(sql, /COUNT\(p.id\) AS mediaCount/);
  assert.match(sql, /p.type = 'photo'/);
  assert.match(sql, /p.type = 'video'/);
  assert.match(sql, /p.source_views_count[^\n]*> 0 OR[^\n]*p.source_likes_count[^\n]*> 0/);
  assert.deepEqual(params, { handle: "aria-lune" });
  rows = [{ ...rawCreator, mediaCount: "0", photoCount: null, videoCount: null, engagedCount: null, totalViews: null, totalLikes: null }];
  const empty = await provider.getCreatorCollectionContext("aria-lune");
  assert.equal(empty?.creator.handle, "aria-lune", "LEFT JOIN must retain an active creator with no public media");
  assert.deepEqual(empty?.stats, { mediaCount: 0, photoCount: 0, videoCount: 0, engagedCount: 0, totalViews: 0, totalLikes: 0 });
  rows = [];
  assert.equal(await provider.getCreatorCollectionContext("removed"), undefined);
  assert.equal(calls.length, 3);
});
