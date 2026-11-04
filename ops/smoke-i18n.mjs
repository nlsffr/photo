import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES, DISCOVERY_ROUTE_PATHS } from "../src/lib/i18n/config.ts";

const EXPECTED_LOCALES = ["en", "fr", "es", "de", "it", "pt", "nl", "ru", "zh", "ja", "hi", "th"];
assert.deepEqual(LOCALES, EXPECTED_LOCALES, "the smoke must cover exactly the twelve published languages");
assert.equal(DISCOVERY_ROUTE_PATHS.length, 6);

export function discoveryPath(locale, path) {
  return locale === "en" ? path : `/${locale}${path === "/" ? "" : path}`;
}

export function discoveryPlan(canonical) {
  const site = canonical.replace(/\/$/, "");
  return LOCALES.flatMap(locale => DISCOVERY_ROUTE_PATHS.map(path => ({
    locale, path: discoveryPath(locale, path),
    canonical: `${site}${discoveryPath(locale, path)}`,
    languages: { ...Object.fromEntries(LOCALES.map(language => [language, `${site}${discoveryPath(language, path)}`])),
      "x-default": `${site}${path}` },
  })));
}

function tags(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))].map(match =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(entry => [
      entry[1].toLowerCase(), entry[2].replaceAll("&amp;", "&"),
    ])),
  );
}

export async function smoke(origin = "http://localhost:3000", canonical = "https://leakfanhub.com", request = fetch) {
  origin = origin.replace(/\/$/, "");
  canonical = canonical.replace(/\/$/, "");
  const headers = { host: new URL(canonical).host, "x-forwarded-host": new URL(canonical).host, "x-forwarded-proto": "https" };
  const page = async path => {
    const response = await request(`${origin}${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    return { response, html: await response.text() };
  };
  const plan = discoveryPlan(canonical);
  assert.equal(plan.length, 72);
  for (const entry of plan) {
    const { response, html } = await page(entry.path);
    assert.equal(response.status, 200, entry.path);
    assert.equal(tags(html, "html")[0]?.lang, entry.locale, `${entry.path} document language`);
    assert.ok(/<h1\b/i.test(html), `${entry.path} has a heading`);
    const links = tags(html, "link");
    // URL.origin serializes a bare root without '/', while URL.href includes it.
    // They designate the same canonical resource; other path/host differences still fail.
    assert.equal(new URL(links.find(link => link.rel === "canonical")?.href).href, entry.canonical, `${entry.path} self canonical`);
    const alternates = Object.fromEntries(links.filter(link => link.hreflang).map(link => [link.hreflang, new URL(link.href).href]));
    assert.deepEqual(alternates, entry.languages, `${entry.path} reciprocal alternates`);
    const metadata = tags(html, "meta");
    assert.ok(metadata.find(meta => meta.name === "description")?.content?.trim(), `${entry.path} description`);
    assert.ok(!metadata.some(meta => meta.name === "robots" && /noindex/i.test(meta.content)), `${entry.path} indexable`);
    if (DISCOVERY_ROUTE_PATHS.at(-1) === entry.path.replace(new RegExp(`^/${entry.locale}(?=/|$)`), "")) {
      console.log(JSON.stringify({ locale: entry.locale, pages: 6, passed: true }));
    }
  }
  const { response: sitemapResponse, html: sitemap } = await page("/sitemaps/static");
  assert.equal(sitemapResponse.status, 200);
  const entries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).href);
  assert.equal(entries.length, 80, "72 discovery addresses and8 bare editorial addresses");
  assert.equal(new Set(entries).size, 80);
  for (const entry of plan) assert.ok(entries.includes(entry.canonical), entry.canonical);
  for (const path of ["/about", "/dmca", "/trust-and-safety", "/contact", "/conditions", "/confidentialite", "/mentions-legales", "/qu-est-ce-que-lumengallery"]) {
    assert.ok(entries.includes(`${canonical}${path}`), `bare editorial entry ${path}`);
  }
  assert.ok(!entries.some(url => /^\/en(?:\/|$)/.test(new URL(url).pathname)), "English has no prefixed public address");
  for (const [path, target] of [["/en", "/"], ["/en/models?page=2", "/models?page=2"], ...LOCALES.map(locale => [`/${locale}/about`, "/about"])]) {
    const { response } = await page(path);
    assert.equal(response.status, 308, `${path} permanent redirect`);
    assert.equal(response.headers.get("location"), `${canonical}${target}`);
  }
  for (const locale of ["ru", "zh", "ja", "hi", "th"]) {
    const { response } = await page(`/${locale}/api/readyz`);
    assert.equal(response.status, 404, `a locale cannot wrap the API: ${locale}`);
  }
  for (const path of ["/api/healthz", "/api/readyz"]) assert.equal((await page(path)).response.status, 200, path);
  const result = { passed: true, discoveryPages: plan.length, staticSitemapUrls: entries.length, legacyRedirects: 14, rejectedLocalizedMachinePaths: 5 };
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  smoke(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
}
