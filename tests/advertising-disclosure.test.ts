import assert from "node:assert/strict";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

async function page(pathname: string, locale: "en" | "fr" = "en") {
  const { LocalizedPage } = loadAppModule<{ LocalizedPage: (props: { pathname: string; locale: "en" | "fr"; searchParams: Promise<Record<string, string>> }) => Promise<ReactNode> }>("src/features/i18n/LocalizedPage.tsx", {
    "server-only": {}, "@/lib/photos": {}, "@/lib/seo-page-metadata": {},
    "@/features/creator/CreatorCollectionPage": {}, "@/features/media/MediaDetailPage": {},
    "next/link": { __esModule: true, default: "a" }, "@/components/LocalizedLink": { LocalizedLink: "a" },
  });
  return renderToStaticMarkup(await LocalizedPage({ pathname, locale, searchParams: Promise.resolve({}) }));
}

test("the public English About route accurately describes optional partner advertising and the refusal/Premium exclusions", async () => {
  const html = await page("/about");
  assert.match(html, /TrafficStars/); assert.match(html, /ExoClick/);
  assert.match(html, /decline/i); assert.match(html, /Cookie choices/); assert.match(html, /Premium/);
  assert.doesNotMatch(html, /We avoid third-party advertising trackers/);
});

test("English and French privacy routes name both partners and link their policies", async () => {
  for (const locale of ["en", "fr"] as const) {
    const html = await page("/confidentialite", locale);
    for (const url of ["https://trafficstars.com/privacy-policy/", "https://www.exoclick.com/privacy-policy/"]) assert.ok(html.includes(`href="${url}"`), `${locale}: ${url}`);
    assert.match(html, /TrafficStars/); assert.match(html, /ExoClick/); assert.match(html, /Premium/);
    assert.ok(html.includes(locale === "en" ? "Cookie choices" : "Choix des cookies"));
  }
});

test("English privacy distinguishes its cookie-free aggregate page counter from exact people and optional analytics", async () => {
  const html = await page("/confidentialite");
  assert.match(html, /Aggregate page measurement/);
  assert.match(html, /without cookies or a personal visitor identifier/);
  assert.match(html, /cannot count the exact number of people/);
  assert.match(html, /Optional audience measurement/);
  assert.doesNotMatch(html, /No advertising fingerprinting/);
});
