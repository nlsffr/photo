import assert from "node:assert/strict";
import test from "node:test";
import type { Photo, PhotoView } from "../src/lib/types";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const photo: Photo = {
  id: "current", creatorHandle: "fixture-creator", title: "fixture",
  imageUrl: "/fixture.jpg", type: "photo", tags: ["portrait"],
  width: 1, height: 1, views: 0, likes: 0, ageMinutes: 0, trending: 0,
};

type Provider = {
  getRelatedPhotos(photo: Photo, limit?: number): Promise<PhotoView[]>;
  getPhotos(query: unknown): Promise<{ items: PhotoView[] }>;
};

function providerWithQuery(query: (sql: string, params: unknown[]) => Promise<unknown>) {
  const { MariaDBProvider } = loadAppModule<{ MariaDBProvider: new () => Provider }>(
    "src/lib/providers/mariadb.ts",
    { "../db-pool": { requireDbPool: () => ({ query }) } },
  );
  return new MariaDBProvider();
}

test("related tag search bounds each normalized exact and legacy matcher before joining media", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const provider = providerWithQuery(async (sql, params) => {
    calls.push({ sql, params });
    return [[], []];
  });
  await provider.getRelatedPhotos({ ...photo, tags: [
    " PORTRAIT ", "portrait", "tag-2", "tag-3", "tag-4", "tag-5", "tag-6", "tag-7",
  ] }, 36);

  assert.equal(calls.length, 1);
  const { sql, params } = calls[0];
  assert.match(sql, /max_statement_time=2\b/);
  assert.equal((sql.match(/LIMIT 100/g) ?? []).length, 12);
  assert.equal((sql.match(/WHERE tag = \? ORDER BY photo_id LIMIT 100/g) ?? []).length, 6);
  assert.equal((sql.match(/WHERE tag LIKE \? LIMIT 100/g) ?? []).length, 6);
  assert.equal((sql.match(/UNION DISTINCT/g) ?? []).length, 11);
  assert.equal((sql.match(/idx_photo_tags_tag_id/g) ?? []).length, 12);
  assert.match(sql, /p\.id <> \?/);
  assert.match(sql, /p\.is_hidden = 0/);
  assert.match(sql, /c\.is_hidden = 0/);
  assert.match(sql, /p\.removed_from_index_at IS NULL/);
  assert.match(sql, /c\.removed_from_index_at IS NULL/);
  assert.match(sql, /ORDER BY p\.views_count \+ p\.likes_count \* 3 DESC/);
  assert.equal(params.length, 14);
  assert.deepEqual(params.slice(0, 2), ["portrait", "{'slug': 'portrait',%"]);
  assert.deepEqual(params.slice(-2), [photo.id, 36]);
  assert.equal(params.includes("tag-7"), false);
  assert.doesNotMatch(sql, /portrait|tag-2/);
});

test("optional related media timeout returns no recommendations and logs no SQL, parameters or content", async () => {
  for (const error of [
    { code: "ER_STATEMENT_TIMEOUT", message: "secret SQL and target" },
    { errno: 1969, sql: "secret SQL and target" },
  ]) {
    const provider = providerWithQuery(async () => { throw error; });
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    try {
      assert.deepEqual(await provider.getRelatedPhotos(photo), []);
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.deepEqual(JSON.parse(String(warnings[0][0])), {
      event: "database_query_timeout", query: "related_media", code: "ER_STATEMENT_TIMEOUT",
    });
    assert.doesNotMatch(JSON.stringify(warnings), /secret|portrait|fixture-creator/);
  }
});

test("unexpected database failures remain visible to the caller", async () => {
  const error = Object.assign(new Error("synthetic connection failure"), { code: "ECONNRESET" });
  const provider = providerWithQuery(async () => { throw error; });
  await assert.rejects(provider.getRelatedPhotos(photo), (actual) => actual === error);
});

test("related media retain matching rows and hydrated tags after the bounded query", async () => {
  const calls: string[] = [];
  const provider = providerWithQuery(async (sql) => {
    calls.push(sql);
    return sql.includes("SELECT photo_id, tag")
      ? [[{ photo_id: "other", tag: "portrait" }], []]
      : [[{
        id: "other", source_id: "42", creator_handle: "fixture-creator", creator_name: "Fixture",
        title: "fixture", image_url: "/fixture.jpg", type: "photo", created_at: "2026-11-01T00:00:00Z",
        views_count: 12, likes_count: 3, width: 10, height: 10,
      }], []];
  });
  const result = await provider.getRelatedPhotos(photo);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "other");
  assert.deepEqual(result[0].tags, ["portrait"]);
  assert.equal(calls.length, 2);
});

test("media without usable tags retain the creator fallback and exclude the current item", async () => {
  const provider = providerWithQuery(async () => { throw Error("unexpected tag query"); });
  const calls: unknown[] = [];
  provider.getPhotos = async (query) => {
    calls.push(query);
    return { items: [photo as PhotoView, { ...photo, id: "other" } as PhotoView] };
  };
  assert.deepEqual((await provider.getRelatedPhotos({ ...photo, tags: [] }, 12)).map((item) => item.id), ["other"]);
  assert.deepEqual(calls, [{ creator: photo.creatorHandle, sort: "popular", limit: 12 }]);
});
