import assert from "node:assert/strict";
import test from "node:test";

async function loadPagination() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/models-pagination.ts");
}

test("normalizes model page requests to a bounded server batch", async () => {
  const { MODELS_PAGE_SIZE, parseModelsPageRequest } = await loadPagination();

  assert.equal(MODELS_PAGE_SIZE, 60);
  assert.deepEqual(
    parseModelsPageRequest(new URLSearchParams("sort=views&offset=120")),
    { sort: "views", offset: 120, limit: 60 },
  );
  assert.deepEqual(
    parseModelsPageRequest(new URLSearchParams("sort=unknown&offset=-4")),
    { sort: "followers", offset: 0, limit: 60 },
  );
  assert.deepEqual(
    parseModelsPageRequest(new URLSearchParams("offset=not-a-number")),
    { sort: "followers", offset: 0, limit: 60 },
  );
  assert.deepEqual(
    parseModelsPageRequest(new URLSearchParams("offset=99999999")),
    { sort: "followers", offset: 1_000_000, limit: 60 },
  );
});

test("appends model batches without duplicating creators already rendered", async () => {
  const { appendUniqueCreators } = await loadPagination();
  const current = [
    { handle: "alice", label: "Alice" },
    { handle: "bob", label: "Bob" },
  ];
  const incoming = [
    { handle: "bob", label: "Bob duplicate" },
    { handle: "cara", label: "Cara" },
  ];

  assert.deepEqual(appendUniqueCreators(current, incoming), [
    { handle: "alice", label: "Alice" },
    { handle: "bob", label: "Bob" },
    { handle: "cara", label: "Cara" },
  ]);
});

test("builds a page payload from one look-ahead row", async () => {
  const { buildModelsPagePayload } = await loadPagination();
  const rows = [
    { handle: "alice" },
    { handle: "bob" },
    { handle: "cara" },
  ];

  assert.deepEqual(buildModelsPagePayload(rows, 120, 2), {
    items: [{ handle: "alice" }, { handle: "bob" }],
    hasMore: true,
    nextOffset: 122,
  });
  assert.deepEqual(buildModelsPagePayload(rows.slice(0, 2), 120, 2), {
    items: [{ handle: "alice" }, { handle: "bob" }],
    hasMore: false,
    nextOffset: null,
  });
});
