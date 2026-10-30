import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import test from "node:test";

const APP_ROUTES = new URL("../src/app", import.meta.url).pathname;
const MEDIA_ROUTES = new URL("../src/app/sitemaps/media", import.meta.url).pathname;

async function routePaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return routePaths(path);
      if (entry.name !== "route.ts") return [];
      const route = relative(MEDIA_ROUTES, directory)
        .split(sep)
        .filter(Boolean)
        .join("/");
      return [`/sitemaps/media/${route}`];
    }),
  );
  return nested.flat();
}

test("legacy and stable media sitemap routes have no dynamic slug conflict", async () => {
  const { getSortedRoutes } = await import(
    "next/dist/shared/lib/router/utils/sorted-routes.js"
  );
  const routes = await routePaths(MEDIA_ROUTES);

  assert.doesNotThrow(() => getSortedRoutes(routes));
  assert.ok(routes.includes("/sitemaps/media/[chunk]"));
  assert.ok(routes.includes("/sitemaps/media/stable/[date]/[cursor]"));
});

test("the route-owned sitemap index delegates localized pages to the static child", async () => {
  await assert.rejects(access(join(APP_ROUTES, "sitemap.ts")), { code: "ENOENT" });

  const [indexRoute, staticRoute, robots] = await Promise.all([
    readFile(join(APP_ROUTES, "sitemap.xml/route.ts"), "utf8"),
    readFile(join(APP_ROUTES, "sitemaps/static/route.ts"), "utf8"),
    readFile(join(APP_ROUTES, "robots.ts"), "utf8"),
  ]);

  assert.match(indexRoute, /getSitemapMediaPartitions/);
  assert.match(indexRoute, /\$\{SITE\}\/sitemaps\/static/);
  assert.match(staticRoute, /renderLocalizedStaticSitemapXml/);
  assert.match(robots, /\$\{SITE\}\/sitemap\.xml/);
});

test("creator collection sitemap buckets reuse a bounded five-minute cache", async () => {
  const [profileRoute, collectionRoute, bucketRoute, dataSource] = await Promise.all([
    readFile(join(APP_ROUTES, "sitemaps/profiles/route.ts"), "utf8"),
    readFile(join(APP_ROUTES, "sitemaps/collections/[collection]/route.ts"), "utf8"),
    readFile(join(APP_ROUTES, "sitemaps/creators/[collection]/[bucket]/route.ts"), "utf8"),
    readFile(new URL("../src/lib/creator-sitemap-data.ts", import.meta.url), "utf8"),
  ]);

  assert.match(profileRoute, /creatorSitemapPartitionLocations\(SITE, "overview"\)/);
  assert.match(collectionRoute, /creatorSitemapPartitionLocations\(SITE, collection\)/);
  assert.match(bucketRoute, /loadCreatorSitemap\(collection, bucket\)/);
  assert.match(dataSource, /createAsyncTtlCacheMap/);
  assert.match(dataSource, /getCreatorSitemapProfiles/);
  assert.match(dataSource, /const CACHE_TTL_MS = 5 \* 60 \* 1_000/);
  assert.match(dataSource, /CREATOR_SITEMAP_QUERY_LIMIT \+ 1/);
  assert.match(dataSource, /assertCreatorSitemapCapacity\(profiles\)/);
});

test("expensive sitemap routes reuse one five-minute in-process rendering", async () => {
  const [indexRoute, popularRoute] = await Promise.all([
    readFile(join(APP_ROUTES, "sitemap.xml/route.ts"), "utf8"),
    readFile(join(APP_ROUTES, "sitemaps/popular/route.ts"), "utf8"),
  ]);

  for (const route of [indexRoute, popularRoute]) {
    assert.match(route, /createAsyncTtlCache/);
    assert.match(route, /const CACHE_TTL_MS = 5 \* 60 \* 1_000/);
    assert.match(route, /stale-while-revalidate=60/);
  }
  assert.match(indexRoute, /const loadSitemapIndex = createAsyncTtlCache/);
  assert.match(popularRoute, /const loadPopularSitemap = createAsyncTtlCache/);
});

test("sitemap responses own their cache policy without a global HTML override", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const { default: nextConfig } = await import("../next.config.ts");
  const rules = (await nextConfig.headers?.()) ?? [];
  const sitemapCacheRules = rules.filter(
    (rule) =>
      rule.source.includes("sitemap") &&
      rule.headers.some((header) => header.key.toLowerCase() === "cache-control"),
  );

  assert.deepEqual(sitemapCacheRules, []);
});
