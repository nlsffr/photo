import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server.js";

async function registeredMatcher(): Promise<string> {
  const source = await readFile(
    new URL("../src/proxy.ts", import.meta.url),
    "utf8",
  );
  const literal = source.match(
    /matcher:\s*\[\s*("(?:\\.|[^"\\])*")/,
  )?.[1];
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
