import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import test from "node:test";

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
