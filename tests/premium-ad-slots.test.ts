import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

function render(variant: "banner" | "interstitial", input: { ready?: boolean; isPremium?: boolean; reason?: string; serving?: boolean } = {}) {
  const { AdSlot } = loadAppModule<{ AdSlot: ComponentType<{ variant: string }> }>("src/components/AdSlot.tsx", {
    "./Premium": { usePremium: () => ({ ready: input.ready ?? true, isPremium: input.isPremium ?? false }) },
    "./AdsProvider": { useAds: () => ({ runtime: input.reason ? { reason: input.reason } : null, canServe: () => input.serving ?? false }) },
    "./LocaleProvider": { useLocale: () => ({ locale: "en" }) },
    "./LocalizedLink": { LocalizedLink: "a" },
    "@/lib/ads-sdk": { mountTrafficStarsAd: () => { throw new Error("A legacy promotion cannot start an ad SDK."); } },
    "@/lib/ads-profiles": { adSpotFor: () => null },
  });
  return renderToStaticMarkup(createElement(AdSlot, { variant }));
}

for (const variant of ["banner", "interstitial"] as const) {
  test(`${variant} leaves no markup or reserved height for a confirmed Premium member`, () => {
    assert.equal(render(variant, { isPremium: true }), "");
  });
  for (const reason of ["premium", "owner"]) {
    test(`${variant} respects the server ${reason} exclusion even before the client status catches up`, () => {
      assert.equal(render(variant, { reason }), "");
    });
  }
  test(`${variant} leaves no space while the identity or entitlement is unresolved`, () => {
    assert.equal(render(variant, { ready: false }), "");
  });
  test(`${variant} keeps the existing first-party promotion for a verified ordinary member`, () => {
    assert.match(render(variant, { reason: "consent_refused" }), /Advertisement/);
  });
}

test("a real header ad continues to suppress the legacy banner without creating a duplicate", () => {
  assert.equal(render("banner", { serving: true }), "");
});
