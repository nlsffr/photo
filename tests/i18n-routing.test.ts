import assert from "node:assert/strict";
import test from "node:test";

async function loadConfig() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/i18n/config.ts");
}

test("unprefixed localized pages redirect using the persisted or negotiated locale", async () => {
  const { localeRedirectTarget } = await loadConfig();

  assert.equal(localeRedirectTarget("/", null, "fr-FR,fr;q=0.9"), "/fr");
  assert.equal(localeRedirectTarget("/models", "en", "fr"), "/en/models");
  assert.equal(
    localeRedirectTarget("/contact/support", "fr", "en"),
    "/fr/contact/support",
  );
});

test("prefixed, system and content-detail URLs are left alone", async () => {
  const { localeRedirectTarget } = await loadConfig();

  for (const pathname of [
    "/en",
    "/fr/models",
    "/api/healthz",
    "/_next/image",
    "/sitemap.xml",
    "/creator-handle",
    "/creator-handle/media-id",
    "/tag/portrait",
  ]) {
    assert.equal(localeRedirectTarget(pathname, "fr", "fr"), null, pathname);
  }
});

test("every declared localized route has a deterministic English and French URL", async () => {
  const { LOCALIZED_ROUTE_PATHS, localePath, localeRedirectTarget } =
    await loadConfig();

  for (const pathname of LOCALIZED_ROUTE_PATHS) {
    assert.equal(localeRedirectTarget(pathname, "fr", null), localePath("fr", pathname));
    assert.equal(localeRedirectTarget(pathname, "en", null), localePath("en", pathname));
  }
});
