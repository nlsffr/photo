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
  assert.equal((plan.fromSql.match(/EXISTS \(SELECT 1 FROM photo_tags/g) ?? []).length, 3);
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
