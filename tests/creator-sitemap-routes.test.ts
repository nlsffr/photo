import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type LegacyCollectionRoute = {
  GET: (
    request: Request,
    context: { params: Promise<{ collection: string }> },
  ) => Promise<Response>;
};

type PartitionRoute = {
  GET: (
    request: Request,
    context: { params: Promise<{ collection: string; bucket: string }> },
  ) => Promise<Response>;
};

type ProfileRoute = { GET: () => Promise<Response> };
type RootSitemapRoute = { GET: () => Promise<Response> };

function loadLegacyCollectionRoute() {
  return loadAppModule<LegacyCollectionRoute>(
    "src/app/sitemaps/collections/[collection]/route.ts",
  );
}

function loadPartitionRoute(loader: (collection: string, bucket: number) => Promise<string>) {
  return loadAppModule<PartitionRoute>(
    "src/app/sitemaps/creators/[collection]/[bucket]/route.ts",
    { "@/lib/creator-sitemap-data": { loadCreatorSitemap: loader } },
  );
}

test("legacy creator collection routes are stable indexes over 64 buckets", async () => {
  const route = loadLegacyCollectionRoute();

  for (const collection of ["photos", "videos", "popular"]) {
    const response = await route.GET(
      new Request(`https://leakfanhub.com/sitemaps/collections/${collection}`),
      { params: Promise.resolve({ collection }) },
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type") ?? "", /application\/xml/);
    const body = await response.text();
    assert.equal((body.match(/<sitemap>/g) ?? []).length, 64);
    assert.match(body, new RegExp(`/sitemaps/creators/${collection}/00`));
    assert.match(body, new RegExp(`/sitemaps/creators/${collection}/63`));
  }
});

test("legacy profile sitemap is a stable index over the 64 overview buckets", async () => {
  const route = loadAppModule<ProfileRoute>("src/app/sitemaps/profiles/route.ts");
  const response = await route.GET();
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal((body.match(/<sitemap>/g) ?? []).length, 64);
  assert.match(body, /\/sitemaps\/creators\/overview\/00/);
  assert.match(body, /\/sitemaps\/creators\/overview\/63/);
});

test("root sitemap advertises every creator bucket directly without legacy duplicates", async () => {
  const route = loadAppModule<RootSitemapRoute>("src/app/sitemap.xml/route.ts", {
    "@/lib/sitemap-data": {
      getSitemapMediaPartitions: async () => [
        { path: "/sitemaps/media/stable/2026-10-30/start" },
      ],
    },
  });
  const response = await route.GET();
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.equal((body.match(/<sitemap>/g) ?? []).length, 3 + (4 * 64) + 1);
  assert.match(body, /\/sitemaps\/creators\/overview\/00/);
  assert.match(body, /\/sitemaps\/creators\/popular\/63/);
  assert.match(body, /\/sitemaps\/media\/stable\/2026-10-30\/start/);
  assert.doesNotMatch(body, /\/sitemaps\/profiles|\/sitemaps\/collections\//);
});

test("unknown legacy creator sitemap collection is a 404", async () => {
  const route = loadLegacyCollectionRoute();
  const response = await route.GET(
    new Request("https://leakfanhub.com/sitemaps/collections/unknown"),
    { params: Promise.resolve({ collection: "unknown" }) },
  );
  assert.equal(response.status, 404);
});

test("creator sitemap partition route serves valid families and exact buckets", async () => {
  const calls: Array<[string, number]> = [];
  const route = loadPartitionRoute(async (collection, bucket) => {
    calls.push([collection, bucket]);
    return `<?xml version="1.0"?><urlset data-key="${collection}:${bucket}"/>`;
  });

  for (const [collection, bucket] of [["overview", "00"], ["photos", "07"], ["videos", "42"], ["popular", "63"]]) {
    const response = await route.GET(
      new Request(`https://leakfanhub.com/sitemaps/creators/${collection}/${bucket}`),
      { params: Promise.resolve({ collection, bucket }) },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=300, stale-while-revalidate=60");
    assert.match(await response.text(), new RegExp(`data-key="${collection}:${Number(bucket)}"`));
  }
  assert.deepEqual(calls, [["overview", 0], ["photos", 7], ["videos", 42], ["popular", 63]]);
});

test("invalid creator sitemap family or bucket is a 404 without a data call", async () => {
  let calls = 0;
  const route = loadPartitionRoute(async () => {
    calls++;
    return "unexpected";
  });
  for (const [collection, bucket] of [["unknown", "00"], ["photos", "64"], ["photos", "7"]]) {
    const response = await route.GET(
      new Request(`https://leakfanhub.com/sitemaps/creators/${collection}/${bucket}`),
      { params: Promise.resolve({ collection, bucket }) },
    );
    assert.equal(response.status, 404);
  }
  assert.equal(calls, 0);
});

test("creator sitemap partition failures fail closed without a cacheable partial document", async () => {
  const route = loadPartitionRoute(async () => {
    throw new Error("database unavailable");
  });
  const response = await route.GET(
    new Request("https://leakfanhub.com/sitemaps/creators/photos/00"),
    { params: Promise.resolve({ collection: "photos", bucket: "00" }) },
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
