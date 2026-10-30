import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadPolicy() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit suffix.
    return await import("../src/lib/public-content-policy.ts");
  } catch (error) {
    assert.fail(`public content policy is unavailable: ${String(error)}`);
  }
}

async function loadSqlPolicy() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit suffix.
    return await import("../src/lib/providers/active-content-sql.ts");
  } catch (error) {
    assert.fail(`active content SQL policy is unavailable: ${String(error)}`);
  }
}

test("a removed creator is gone for both legacy and current versioned URLs", async () => {
  const { creatorRouteDecision } = await loadPolicy();
  const removed = {
    urlVersion: 346,
    removedFromIndexAt: "2026-10-29T00:00:00.000Z",
  };

  assert.equal(creatorRouteDecision(removed, null), "gone");
  assert.equal(creatorRouteDecision(removed, 346), "gone");
  assert.equal(creatorRouteDecision(removed, 345), "gone");
});
test("active creator URLs still enforce their one canonical version", async () => {
  const { creatorRouteDecision } = await loadPolicy();
  const activeV1 = { urlVersion: 1, removedFromIndexAt: null };
  const activeV3 = { urlVersion: 3, removedFromIndexAt: null };

  assert.equal(creatorRouteDecision(undefined, null), "missing");
  assert.equal(creatorRouteDecision(activeV1, null), "serve");
  assert.equal(creatorRouteDecision(activeV1, 1), "missing");
  assert.equal(creatorRouteDecision(activeV3, null), "missing");
  assert.equal(creatorRouteDecision(activeV3, 3), "serve");
});

test("the canonical SQL predicate requires both the media and creator to be active", async () => {
  const { activeCreatorSql, activeMediaSql } = await loadSqlPolicy();

  assert.equal(activeCreatorSql("owner"), "owner.removed_from_index_at IS NULL");
  assert.equal(
    activeMediaSql("asset", "owner"),
    "asset.removed_from_index_at IS NULL AND owner.removed_from_index_at IS NULL",
  );
});

test("every public DB surface reuses the active-content SQL policy", async () => {
  const files = await Promise.all(
    [
      "../src/lib/providers/mariadb.ts",
      "../src/lib/sitemap-data.ts",
      "../src/app/api/library/route.ts",
      "../src/lib/interactions-db.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  const [provider, sitemap, library, interactions] = files;
  assert.ok((provider.match(/activeMediaSql\(/g) ?? []).length >= 5);
  assert.ok((provider.match(/activeCreatorSql\(/g) ?? []).length >= 4);
  assert.ok((sitemap.match(/activeMediaSql\(/g) ?? []).length >= 3);
  assert.ok((library.match(/activeMediaSql\(/g) ?? []).length >= 3);
  assert.ok((interactions.match(/activeMediaSql\(/g) ?? []).length >= 4);
  assert.ok((interactions.match(/activeCreatorSql\(/g) ?? []).length >= 2);
});

test("profile metadata, pages, redirects, and uploads reject removed creators", async () => {
  const files = await Promise.all(
    [
      "../src/proxy.ts",
      "../src/features/creator/CreatorCollectionPage.tsx",
      "../src/app/(default)/creator/[handle]/page.tsx",
      "../src/app/(default)/[handle]/[id]/page.tsx",
      "../src/app/api/media/upload/route.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  const [proxy, profile, legacyProfile, media, upload] = files;
  assert.match(proxy, /creatorRouteDecision/);
  assert.match(profile, /isRemovedContent\(/);
  assert.match(legacyProfile, /isRemovedContent\(/);
  assert.match(media, /isRemovedContent\(/);
  assert.match(upload, /isRemovedContent\(/);
});

test("comments, views, and interaction writes reject removed media", async () => {
  const [comments, views, viewRoute, interactionsRoute] = await Promise.all(
    [
      "../src/app/api/comments/route.ts",
      "../src/lib/source-engagement.ts",
      "../src/app/api/photos/view/route.ts",
      "../src/app/api/interactions/route.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  assert.ok((comments.match(/activeMediaSql\(/g) ?? []).length >= 2);
  assert.match(comments, /photo_not_found/);
  assert.match(views, /p\.removed_from_index_at IS NULL/);
  assert.match(views, /c\.removed_from_index_at IS NULL/);
  assert.match(viewRoute, /photo_not_found/);
  assert.match(interactionsRoute, /photo_not_found/);
});

test("dynamic public routes fail closed when removal status cannot be checked", async () => {
  const proxy = await readFile(
    new URL("../src/proxy.ts", import.meta.url),
    "utf8",
  );

  assert.match(proxy, /function unavailable\(/);
  assert.ok((proxy.match(/return unavailable\(\)/g) ?? []).length >= 3);
  assert.match(proxy, /status: 503/);
  assert.match(proxy, /"Cache-Control": "no-store"/);
});

test("removed sitemap entries cannot linger in a day-long stale cache", async () => {
  const routes = await Promise.all(
    [
      "../src/app/sitemaps/profiles/route.ts",
      "../src/app/sitemaps/collections/[collection]/route.ts",
      "../src/app/sitemaps/creators/[collection]/[bucket]/route.ts",
      "../src/app/sitemaps/popular/route.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const route of routes) {
    assert.doesNotMatch(route, /stale-while-revalidate=86400/);
    assert.match(route, /max-age=300/);
  }
});
