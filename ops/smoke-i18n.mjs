import assert from "node:assert/strict";

const origin = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const canonical = (process.argv[3] || "https://leakfanhub.com").replace(/\/$/, "");
const locales = ["en", "fr", "es", "de", "it", "pt", "nl"];
const paths = ["", "/models", "/trending-medias", "/most-liked", "/classements", "/influenceuses-tendances"];
const headers = {
  host: new URL(canonical).host,
  "x-forwarded-host": new URL(canonical).host,
  "x-forwarded-proto": "https",
};
let checked = 0;

async function page(path) {
  const response = await fetch(`${origin}${path}`, {
    headers, redirect: "manual", signal: AbortSignal.timeout(30_000),
  });
  return { response, html: await response.text() };
}

function tags(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))].map((match) =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [
      entry[1].toLowerCase(), entry[2].replaceAll("&amp;", "&"),
    ])),
  );
}

for (const locale of locales) {
  for (const path of paths) {
    const pathname = `/${locale}${path}`;
    const { response, html } = await page(pathname);
    assert.equal(response.status, 200, pathname);
    assert.equal(tags(html, "html")[0]?.lang, locale, `${pathname} document language`);
    assert.ok(/<h1\b/i.test(html), `${pathname} has a heading`);
    const links = tags(html, "link");
    assert.equal(links.find((link) => link.rel === "canonical")?.href,
      `${canonical}${pathname}`, `${pathname} canonical`);
    const alternates = Object.fromEntries(links.filter((link) => link.hreflang)
      .map((link) => [link.hreflang, new URL(link.href).href]));
    assert.deepEqual(alternates, {
      ...Object.fromEntries(locales.map((language) => [language, `${canonical}/${language}${path}`])),
      "x-default": `${canonical}${path || "/"}`,
    }, `${pathname} reciprocal alternates`);
    const metadata = tags(html, "meta");
    assert.ok(metadata.find((meta) => meta.name === "description")?.content?.trim(), `${pathname} description`);
    assert.ok(!metadata.some((meta) => meta.name === "robots" && /noindex/i.test(meta.content)), `${pathname} indexable`);
    if (!["en", "fr"].includes(locale)) {
      for (const link of tags(html, "a")) {
        if (!link.href?.startsWith(`/${locale}/`)) continue;
        const target = link.href.split(/[?#]/)[0].slice(locale.length + 1);
        assert.ok(paths.includes(target), `${pathname} unsupported localized link: ${link.href}`);
      }
    }
    checked += 1;
  }
  console.log(JSON.stringify({ locale, pages: paths.length, passed: true }));
}

const sitemap = await page("/sitemaps/static");
assert.equal(sitemap.response.status, 200);
const entries = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.equal(entries.length, 58, "static sitemap URL count");
assert.equal(new Set(entries).size, 58, "static sitemap unique URLs");
for (const locale of locales) {
  for (const path of paths) assert.ok(entries.includes(`${canonical}/${locale}${path}`));
}
for (const path of ["/es/about", "/de/lyla", "/pt/lyla/photos", "/nl/lyla/1659433"]) {
  const { response, html } = await page(path);
  assert.ok(response.status === 404 || tags(html, "meta").some(
    (meta) => meta.name === "robots" && /noindex/i.test(meta.content),
  ), `${path} must not create a translated indexable duplicate`);
}
for (const path of ["/api/healthz", "/api/readyz"]) {
  assert.equal((await page(path)).response.status, 200, path);
}
console.log(JSON.stringify({ passed: true, discoveryPages: checked, staticSitemapUrls: entries.length, unsupportedRoutesChecked: 4 }));
