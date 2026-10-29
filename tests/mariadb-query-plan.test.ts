import assert from "node:assert/strict";
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
    /^[0-7][0-9a-f]{7}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  assert.equal(first.extraWhere, "p.id >= :randomPivot");
  assert.equal(first.orderBy, "p.id ASC");
  assert.doesNotMatch(first.orderBy, /RAND/i);
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
