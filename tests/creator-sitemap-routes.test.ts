import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type CollectionRoute = {
  GET: (
    request: Request,
    context: { params: Promise<{ collection: string }> },
  ) => Promise<Response>;
};

function loadCollectionRoute(loader: (collection: string) => Promise<string>) {
  return loadAppModule<CollectionRoute>(
    "src/app/sitemaps/collections/[collection]/route.ts",
    { "@/lib/creator-sitemap-data": { loadCreatorSitemap: loader } },
  );
}

test("creator collection sitemap route serves known collections with crawler cache headers", async () => {
  const calls: string[] = [];
  const route = loadCollectionRoute(async (collection) => {
    calls.push(collection);
    return `<?xml version="1.0"?><urlset data-collection="${collection}"/>`;
  });

  for (const collection of ["photos", "videos", "popular"]) {
    const response = await route.GET(
      new Request(`https://leakfanhub.com/sitemaps/collections/${collection}`),
      { params: Promise.resolve({ collection }) },
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type") ?? "", /application\/xml/);
    assert.equal(
      response.headers.get("Cache-Control"),
      "public, max-age=300, stale-while-revalidate=60",
    );
    assert.match(await response.text(), new RegExp(`data-collection="${collection}"`));
  }
  assert.deepEqual(calls, ["photos", "videos", "popular"]);
});

test("unknown creator sitemap collection is a 404 without touching the data source", async () => {
  let calls = 0;
  const route = loadCollectionRoute(async () => {
    calls++;
    return "unexpected";
  });
  const response = await route.GET(
    new Request("https://leakfanhub.com/sitemaps/collections/unknown"),
    { params: Promise.resolve({ collection: "unknown" }) },
  );

  assert.equal(response.status, 404);
  assert.equal(calls, 0);
});

test("creator sitemap failures fail closed without a cacheable partial document", async () => {
  const route = loadCollectionRoute(async () => {
    throw new Error("database unavailable");
  });
  const response = await route.GET(
    new Request("https://leakfanhub.com/sitemaps/collections/photos"),
    { params: Promise.resolve({ collection: "photos" }) },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
