import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
// @ts-expect-error Native Node needs the extension.
import { loadAppModule } from "./helpers/load-app-module.ts";
// @ts-expect-error Native Node needs the extension.
import { LOCALES, DISCOVERY_ROUTE_PATHS, localePath, localeAlternates, internalLocalePath } from "../src/lib/i18n/config.ts";
// @ts-expect-error Native Node needs the extension.
import { modelsPageAlternates, buildLocalizedMetadata } from "../src/lib/i18n/metadata.ts";
// @ts-expect-error Native Node needs the extension.
import { buildLocalizedSitemapEntries, renderLocalizedStaticSitemapXml } from "../src/lib/i18n/sitemap.ts";

test("only six discoveries have twelve stable public addresses with English bare", () => {
  for (const path of DISCOVERY_ROUTE_PATHS) {
    const expected = Object.fromEntries(LOCALES.map(language => [language,
      language === "en" ? path : `/${language}${path === "/" ? "" : path}`]));
    for (const locale of LOCALES) {
      assert.equal(localePath(locale, path), expected[locale]);
      assert.equal(localePath(locale, `${path}?page=2#items`), `${expected[locale]}?page=2#items`);
      assert.equal(internalLocalePath(locale, path), `/${locale}${path === "/" ? "" : path}`);
    }
    assert.deepEqual(localeAlternates(path), { ...expected, "x-default": path });
  }
  for (const path of ["/aria-v3", "/aria-v3/videos", "/aria/123-v2", "/about", "/contact", "/feed"]) {
    for (const locale of LOCALES) assert.equal(localePath(locale, path), path);
    assert.deepEqual(localeAlternates(path), {});
  }
});

test("discovery canonicals and reciprocal alternates preserve models page and sort", () => {
  const expected = Object.fromEntries(LOCALES.map(language => [language,
    `${language === "en" ? "" : `/${language}`}/models?sort=views&page=2`]));
  for (const locale of LOCALES) {
    const alternates = modelsPageAlternates({ page: "2", sort: "views" }, locale);
    assert.equal(alternates.canonical, expected[locale]);
    assert.deepEqual(alternates.languages, { ...expected, "x-default": "/models?sort=views&page=2" });
    const metadata = buildLocalizedMetadata(locale, "/models", { title: "Fixture", description: "Synthetic fixture" }, { page: "2", sort: "views" });
    assert.deepEqual(metadata.alternates, alternates);
    assert.equal(metadata.openGraph?.url, expected[locale]);
    assert.equal(metadata.description, "Synthetic fixture");
  }
});

test("static sitemap has72 discovery addresses and8 bare editorial addresses only", () => {
  const entries = buildLocalizedSitemapEntries("https://leakfanhub.com");
  assert.equal(entries.length, 80);
  assert.equal(new Set(entries.map(entry => entry.url)).size, 80);
  for (const path of DISCOVERY_ROUTE_PATHS) for (const locale of LOCALES) {
    assert.ok(entries.some(entry => entry.url === `https://leakfanhub.com${localePath(locale, path)}`));
  }
  const xml = renderLocalizedStaticSitemapXml("https://leakfanhub.com");
  assert.equal((xml.match(/<loc>/g) || []).length, 80);
  assert.equal((xml.match(/hreflang="x-default"/g) || []).length, 72);
  assert.doesNotMatch(xml, /https:\/\/leakfanhub\.com\/en(?:\/|<|\")/);
  assert.doesNotMatch(xml, /https:\/\/leakfanhub\.com\/(?:fr|es|de|it|pt|nl|ru|zh|ja|hi|th)\/(?:about|contact|dmca)</);
});

test("discovery response language follows the stable URL regardless of cookie or browser", async () => {
  let lookups = 0;
  const { proxy } = loadAppModule<{ proxy(request: NextRequest): Promise<Response> }>("src/proxy.ts", {
    "@/lib/photos": { getCreator: () => { lookups++; throw Error("unexpected lookup"); }, getPhotoById: () => { lookups++; throw Error("unexpected lookup"); }, getAllTags: () => [] },
  });
  for (const path of DISCOVERY_ROUTE_PATHS) for (const locale of LOCALES) {
    const publicPath = localePath(locale, path);
    for (const preference of ["en", "fr", "ru", "zh", "ja", "hi", "th"]) {
      const response = await proxy(new NextRequest(`https://leakfanhub.com${publicPath}?page=2`, { headers: { cookie: `lfh_locale=${preference}`, "accept-language": "de" } }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("set-cookie"), null);
      if (locale === "en") assert.equal(response.headers.get("x-middleware-rewrite"), `https://leakfanhub.com/en${path === "/" ? "" : path}?page=2`);
      else assert.equal(response.headers.get("x-middleware-next"), "1");
    }
  }
  assert.equal(lookups, 0);
});
