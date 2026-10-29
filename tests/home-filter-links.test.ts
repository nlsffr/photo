import assert from "node:assert/strict";
import test from "node:test";

async function loadLinks() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/home-filter-links.ts");
  } catch (error) {
    assert.fail(`home filter link helpers are unavailable: ${String(error)}`);
  }
}

test("changing one filter preserves the active sort, type, and tag", async () => {
  const { buildHomeHref } = await loadLinks();
  const current = { sort: "recent", type: "photo", tag: "portrait" };

  assert.equal(
    buildHomeHref(current, { type: "video" }),
    "/?sort=recent&type=video&tag=portrait",
  );
  assert.equal(
    buildHomeHref(current, { sort: "trending" }),
    "/?sort=trending&type=photo&tag=portrait",
  );
  assert.equal(
    buildHomeHref(current, { tag: "studio" }),
    "/?sort=recent&type=photo&tag=studio",
  );
});

test("null removes one filter and clear-all returns to discovery", async () => {
  const { buildHomeHref } = await loadLinks();
  const current = { sort: "recent", type: "video", tag: "portrait" };

  assert.equal(buildHomeHref(current, { type: null }), "/?sort=recent&tag=portrait");
  assert.equal(buildHomeHref(current, { clearAll: true }), "/");
  assert.equal(buildHomeHref({ sort: "discover" }, {}), "/");
});
