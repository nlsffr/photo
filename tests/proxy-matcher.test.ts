import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server.js";

async function registeredMatcher(): Promise<string> {
  const source = await readFile(
    new URL("../src/proxy.ts", import.meta.url),
    "utf8",
  );
  const literal = source.match(/matcher:\s*\[\s*("(?:\\.|[^"\\])*")/)?.[1];
  assert.ok(literal, "proxy config must expose one static matcher literal");
  return JSON.parse(literal) as string;
}

test("system namespace names do not exempt similarly named public content", async () => {
  const matcher = await registeredMatcher();

  for (const url of [
    "https://leakfanhub.com/mediaqueen",
    "https://leakfanhub.com/iconic-model/123",
    "https://leakfanhub.com/apiara",
    "https://leakfanhub.com/sitemapsfan/456",
  ]) {
    assert.equal(
      unstable_doesMiddlewareMatch({
        config: { matcher: [matcher] },
        nextConfig: {},
        url,
      }),
      true,
      url,
    );
  }
});

test("exact machine namespaces bypass the public-content proxy", async () => {
  const matcher = await registeredMatcher();

  for (const url of [
    "https://leakfanhub.com/api/photos",
    "https://leakfanhub.com/_next/static/chunk.js",
    "https://leakfanhub.com/media/poster.jpg",
    "https://leakfanhub.com/sitemaps/static",
    "https://leakfanhub.com/favicon.ico",
    "https://leakfanhub.com/robots.txt",
    "https://leakfanhub.com/sitemap.xml",
    "https://leakfanhub.com/icon",
    "https://leakfanhub.com/apple-icon",
  ]) {
    assert.equal(
      unstable_doesMiddlewareMatch({
        config: { matcher: [matcher] },
        nextConfig: {},
        url,
      }),
      false,
      url,
    );
  }
});

// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";
import { NextRequest } from "next/server.js";

type ProxyModule = { proxy: (request: NextRequest) => Promise<Response> };
function collectionProxy(
  creator: { urlVersion: number; removedFromIndexAt?: string } | undefined = {
    urlVersion: 3,
  },
) {
  const lookups: string[] = [];
  const { proxy } = loadAppModule<ProxyModule>("src/proxy.ts", {
    "@/lib/photos": {
      getCreator: async (handle: string) => {
        lookups.push(`creator:${handle}`);
        return creator;
      },
      getPhotoById: async (id: string) => {
        lookups.push(`media:${id}`);
        return { id, creatorHandle: "aria-lune-v3", urlVersion: 1 };
      },
      getAllTags: async () => [],
    },
  });
  return {
    lookups,
    request: (path: string) =>
      proxy(new NextRequest(`https://leakfanhub.com${path}`)),
  };
}

test("reserved collection words win over colliding media IDs without any media lookup", async () => {
  for (const segment of ["photos", "videos", "popular", "%70hotos"]) {
    const { request, lookups } = collectionProxy();
    assert.equal((await request(`/aria-lune-v3/${segment}`)).status, 200);
    assert.deepEqual(lookups, ["creator:aria-lune"]);
  }
});

test("collection creator version and removal decisions keep exact existing HTTP headers", async () => {
  for (const [entity, handle, status, robots, cache] of [
    [{ urlVersion: 1 }, "aria-lune", 200, null, null],
    [{ urlVersion: 1 }, "aria-lune-v1", 404, "noindex", "public, max-age=60"],
    [{ urlVersion: 3 }, "aria-lune", 404, "noindex", "public, max-age=60"],
    [{ urlVersion: 3 }, "aria-lune-v2", 404, "noindex", "public, max-age=60"],
    [
      { urlVersion: 3, removedFromIndexAt: "2026-10-29" },
      "aria-lune-v3",
      410,
      "noindex, noarchive",
      "public, max-age=300",
    ],
    [
      { urlVersion: 3, removedFromIndexAt: "2026-10-29" },
      "aria-lune",
      410,
      "noindex, noarchive",
      "public, max-age=300",
    ],
  ] as const) {
    const { request, lookups } = collectionProxy(entity);
    const response = await request(`/${handle}/photos`);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("X-Robots-Tag"), robots);
    assert.equal(response.headers.get("Cache-Control"), cache);
    assert.deepEqual(lookups, ["creator:aria-lune"]);
  }
});

test("collection lookup outages fail closed and malformed collection handles never reach media", async () => {
  const { proxy } = loadAppModule<ProxyModule>("src/proxy.ts", {
    "@/lib/photos": {
      getCreator: async () => {
        throw new Error("offline");
      },
      getPhotoById: async () => {
        throw new Error("must not query media");
      },
    },
  });
  const response = await proxy(
    new NextRequest("https://leakfanhub.com/aria-lune/photos"),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "30");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  for (const handle of ["bad%2Fhandle", "%ZZ", "photos"]) {
    const { request, lookups } = collectionProxy();
    assert.equal((await request(`/${handle}/photos`)).status, 404);
    assert.deepEqual(lookups, []);
  }
});
