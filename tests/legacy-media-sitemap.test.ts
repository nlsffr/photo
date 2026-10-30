import assert from "node:assert/strict";
import test from "node:test";

test("legacy numeric media sitemaps redirect permanently to the stable index", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const legacyModule = await import("../src/lib/legacy-media-sitemap.ts").catch(
    () => ({}),
  );
  const redirectLegacyMediaSitemap = (
    legacyModule as {
      redirectLegacyMediaSitemap?: (site: string) => Response;
    }
  ).redirectLegacyMediaSitemap;

  assert.equal(typeof redirectLegacyMediaSitemap, "function");
  const response = redirectLegacyMediaSitemap!("https://leakfanhub.com/");

  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://leakfanhub.com/sitemap.xml",
  );
  assert.equal(response.headers.get("cache-control"), "public, max-age=86400");
});
