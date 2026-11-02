import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const ORIGIN = "https://leakfanhub.com";
type Entity = { handle: string; urlVersion: number; removedFromIndexAt?: string };
type Photo = { id: string; creatorHandle: string; urlVersion: number; removedFromIndexAt?: string };
function fixture(options: { creator?: Entity | null; photo?: Photo | null; outage?: boolean } = {}) {
  const lookups: string[] = [];
  const { proxy } = loadAppModule<{ proxy(request: NextRequest): Promise<Response> }>("src/proxy.ts", {
    "@/lib/photos": {
      getCreator: async (handle: string) => {
        lookups.push(`creator:${handle}`);
        if (options.outage) throw new Error("offline");
        return options.creator === undefined ? { handle: "aria-lune", urlVersion: 3 } : options.creator;
      },
      getPhotoById: async (id: string) => {
        lookups.push(`media:${id}`);
        if (options.outage) throw new Error("offline");
        return options.photo === undefined ? { id: "123", creatorHandle: "aria-lune", urlVersion: 2 } : options.photo;
      },
      getAllTags: async () => ["portrait"],
    },
  });
  return {
    lookups,
    request: (path: string, headers: Record<string, string> = {}) => proxy(new NextRequest(`${ORIGIN}${path}`, { headers })),
  };
}
function privateVariant(response: Response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const vary = response.headers.get("vary")?.toLowerCase().split(",").map((value) => value.trim()) || [];
  assert.ok(vary.includes("cookie"));
  assert.ok(vary.includes("accept-language"));
  assert.equal(response.headers.get("set-cookie"), null, "automatic negotiation never replaces the saved preference");
}
function rewrite(response: Response, pathname: string, search = "") {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-middleware-rewrite"), `${ORIGIN}${pathname}${search}`);
  privateVariant(response);
}
function rejected(response: Response, status: number, robots: string, cache: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("x-robots-tag"), robots);
  assert.equal(response.headers.get("cache-control"), cache);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-middleware-rewrite"), null);
}

test("one bare discovery URL rewrites privately to all seven renderers without a public redirect", async () => {
  const { request, lookups } = fixture();
  for (const locale of ["en", "fr", "es", "de", "it", "pt", "nl"]) {
    rewrite(await request("/models?page=2&sort=recent", { cookie: `lfh_locale=${locale}`, "accept-language": "fr" }), `/${locale}/models`, "?page=2&sort=recent");
    rewrite(await request("/", { cookie: `lfh_locale=${locale}` }), `/${locale}`);
  }
  assert.deepEqual(lookups, []);
});

test("negotiation prefers valid cookie, then weighted browser language, then English", async () => {
  const { request } = fixture();
  for (const [cookie, language, expected] of [
    ["de", "fr-FR,fr;q=0.9", "de"],
    ["invalid", "it-IT;q=0.4,es-ES;q=0.9", "es"],
    ["", "fr;q=0,nl-NL;q=0.8,en;q=0.4", "nl"],
    ["", "ja-JP,zh;q=0.9", "en"],
    ["", "", "en"],
  ]) rewrite(await request("/most-liked", { cookie: `lfh_locale=${cookie}`, "accept-language": language }), `/${expected}/most-liked`);
});

test("legacy locale URLs redirect308 to the same-origin bare path with exact search and no preference override", async () => {
  const { request } = fixture();
  for (const locale of ["en", "fr", "es", "de", "it", "pt", "nl"]) {
    for (const path of ["", "/models", "/about", "/aria-lune-v3", "/aria-lune-v3/videos", "/aria-lune/123-v2"]) {
      const response = await request(`/${locale}${path}?page=2&next=https%3A%2F%2Fexample.invalid%2Fadmin%3Fx%3D1`, { cookie: "lfh_locale=nl", "accept-language": "de" });
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), `${ORIGIN}${path || "/"}?page=2&next=https%3A%2F%2Fexample.invalid%2Fadmin%3Fx%3D1`);
      assert.equal(response.headers.get("x-middleware-rewrite"), null);
      privateVariant(response);
    }
  }
});

test("functional fallback does not replace a seven-language preference and legacy tags retain their renderer", async () => {
  const { request } = fixture();
  rewrite(await request("/about", { cookie: "lfh_locale=es" }), "/en/about");
  rewrite(await request("/models", { cookie: "lfh_locale=es" }), "/es/models");
  const tag = await request("/tag/portrait", { cookie: "lfh_locale=es" });
  assert.equal(tag.status, 200);
  assert.equal(tag.headers.get("x-middleware-next"), "1");
  assert.equal(tag.headers.get("x-middleware-rewrite"), null);
  assert.equal((await request("/fr/tag/portrait")).status, 404);
});

test("HTML and RSC/prefetch requests select the same private renderer without a User-Agent branch", async () => {
  const { request } = fixture();
  const modes: Array<Record<string, string>> = [
    {},
    { rsc: "1", "next-router-prefetch": "1", "next-router-state-tree": "%5B%22%22%5D", "next-url": "/models" },
    { "user-agent": "Googlebot" },
  ];
  for (const extra of modes) {
    rewrite(await request("/models?page=2", { cookie: "lfh_locale=fr", ...extra }), "/fr/models", "?page=2");
  }
  for (const locale of ["en", "fr", "en"]) rewrite(await request("/models", { cookie: `lfh_locale=${locale}` }), `/${locale}/models`);
});

test("machine paths and private admin never negotiate or query public content", async () => {
  const { request, lookups } = fixture();
  for (const path of ["/api/photos", "/_next/static/chunk.js", "/media/poster.jpg", "/sitemaps/static", "/robots.txt", "/sitemap.xml", "/favicon.svg", "/icon", "/apple-icon", "/admin/seo", "/admin/seo/activate"]) {
    const response = await request(path, { cookie: "lfh_locale=fr" });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("x-middleware-rewrite"), null, path);
    assert.equal(response.headers.get("location"), null, path);
  }
  assert.deepEqual(lookups, []);
});

test("nested locales, prefixed machine/admin routes and encoded path separators fail closed", async () => {
  const { request, lookups } = fixture();
  for (const path of ["/fr/en/models", "/en/fr", "/fr/api/photos", "/fr/media/poster.jpg", "/fr/_next/static/chunk.js", "/fr/sitemap.xml", "/fr/admin/seo", "/fr/aria%2flune/123-v2", "/fr/aria%5clune/123-v2", "/fr/%ZZ", "/fr//example.invalid"]) {
    const response = await request(path);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("location"), null, path);
    assert.equal(response.headers.get("x-middleware-rewrite"), null, path);
  }
  assert.deepEqual(lookups, []);
});

test("creator profile and collection checks run before a bare rewrite or legacy redirect", async () => {
  for (const prefix of ["", "/fr"]) {
    for (const suffix of ["", "/photos", "/videos", "/popular"]) {
      const { request, lookups } = fixture();
      const response = await request(`${prefix}/aria-lune-v3${suffix}?page=2`, { cookie: "lfh_locale=de" });
      if (prefix) assert.equal(response.headers.get("location"), `${ORIGIN}/aria-lune-v3${suffix}?page=2`);
      else rewrite(response, `/de/aria-lune-v3${suffix}`, "?page=2");
      assert.deepEqual(lookups, ["creator:aria-lune"]);
      for (const old of ["aria-lune", "aria-lune-v1", "aria-lune-v2"]) rejected(await request(`${prefix}/${old}${suffix}`), 404, "noindex", "public, max-age=60");
    }
  }
});

test("removed profiles and collection versions retain410; database outages retain503", async () => {
  for (const prefix of ["", "/fr"]) {
    const removed = fixture({ creator: { handle: "aria-lune", urlVersion: 3, removedFromIndexAt: "2026-10-29" } });
    for (const path of ["/aria-lune", "/aria-lune-v3", "/aria-lune-v2/videos"]) rejected(await removed.request(`${prefix}${path}`), 410, "noindex, noarchive", "public, max-age=300");
    const offline = fixture({ outage: true });
    for (const path of ["/aria-lune-v3", "/aria-lune-v3/videos", "/aria-lune/123-v2"]) {
      const response = await offline.request(`${prefix}${path}`);
      rejected(response, 503, "noindex, noarchive", "no-store");
      assert.equal(response.headers.get("retry-after"), "30");
    }
  }
});

test("media owner, current version and removal guards apply before locale rendering or redirect", async () => {
  for (const prefix of ["", "/es"]) {
    const { request, lookups } = fixture();
    const valid = await request(`${prefix}/aria-lune/123-v2`, { cookie: "lfh_locale=pt" });
    if (prefix) assert.equal(valid.headers.get("location"), `${ORIGIN}/aria-lune/123-v2`);
    else rewrite(valid, "/pt/aria-lune/123-v2");
    assert.deepEqual(lookups, ["media:123-v2"]);
    for (const path of ["/other/123-v2", "/aria-lune/123", "/aria-lune/123-v1"]) rejected(await request(`${prefix}${path}`), 404, "noindex", "public, max-age=60");
    const removed = fixture({ photo: { id: "123", creatorHandle: "aria-lune", urlVersion: 2, removedFromIndexAt: "2026-10-29" } });
    rejected(await removed.request(`${prefix}/aria-lune/123-v2`), 404, "noindex", "public, max-age=60");
  }
});

test("validated legacy aliases resolve before locale rendering and preserve query strings", async () => {
  const { request, lookups } = fixture();
  const alias = await request("/creator/aria-lune-v3?from=old&next=%2Fmodels%3Fpage%3D2");
  assert.equal(alias.status, 308);
  assert.equal(alias.headers.get("location"), `${ORIGIN}/aria-lune-v3?from=old&next=%2Fmodels%3Fpage%3D2`);
  assert.deepEqual(lookups, ["creator:aria-lune"]);
  rejected(await request("/creator/aria-lune-v2"), 404, "noindex", "public, max-age=60");
  const removed = fixture({ creator: { handle: "aria-lune", urlVersion: 3, removedFromIndexAt: "2026-10-29" } });
  rejected(await removed.request("/creator/aria-lune-v3"), 410, "noindex, noarchive", "public, max-age=300");
  const mediaAlias = await request("/photo/123-v2?from=old");
  assert.equal(mediaAlias.status, 308);
  assert.equal(mediaAlias.headers.get("location"), `${ORIGIN}/aria-lune/123-v2?from=old`);
  const tiktok = await request("/tiktok?mode=recent");
  assert.equal(tiktok.status, 308);
  assert.equal(tiktok.headers.get("location"), `${ORIGIN}/feed?mode=recent`);
});

test("canonical host redirects use the configured origin even for scheme-relative-looking paths", async () => {
  const { request } = fixture();
  const response = await request("/models?next=https%3A%2F%2Fexample.invalid", { host: "www.leakfanhub.com", "x-forwarded-proto": "http" });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), `${ORIGIN}/models?next=https%3A%2F%2Fexample.invalid`);
});

test("Next configuration keeps static/media caches and delegates creator aliases to checked Proxy policy", async () => {
  // @ts-expect-error Native Node requires explicit suffixes.
  const { default: config } = await import("../next.config.ts");
  const headers = await config.headers!();
  for (const route of headers) {
    for (const header of route.headers) assert.doesNotMatch(header.value, /s-maxage=120/, route.source);
  }
  assert.ok(headers.some((entry) => entry.source === "/_next/static/:path*" && entry.headers.some((header) => header.value.includes("immutable"))));
  assert.ok(headers.some((entry) => entry.source === "/media/:path*" && entry.headers.some((header) => header.value.includes("max-age=604800"))));
  const redirects = config.redirects ? await config.redirects() : [];
  assert.ok(!redirects.some((entry) => entry.source === "/creator/:handle"));
});
