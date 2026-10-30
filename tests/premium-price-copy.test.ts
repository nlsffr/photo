import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { LOCALES } from "../src/lib/i18n/config.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { getPlan } from "../src/lib/premium-plans.ts";

function renderAd(locale: string, stars?: number, isPremium = false) {
  const { AdSlot } = loadAppModule<{ AdSlot: ComponentType<{ variant: string }> }>(
    "src/components/AdSlot.tsx",
    {
      "./Premium": { usePremium: () => ({ isPremium, ready: true }) },
      "./LocaleProvider": { useLocale: () => ({ locale }) },
      "./LocalizedLink": { LocalizedLink: "a" },
      ...(stars === undefined ? {} : {
        "@/lib/premium-plans": {
          getPlan: (id: string) => {
            assert.equal(id, "month");
            return { stars, days: 45 };
          },
        },
      }),
    },
  );
  return renderToStaticMarkup(createElement(AdSlot, { variant: "interstitial" }));
}

for (const locale of LOCALES) {
  test(`${locale} advertises the configured monthly amount in Stars`, () => {
    const html = renderAd(locale);
    const price = new Intl.NumberFormat(locale).format(getPlan("month").stars);
    assert.ok(html.includes(`${price} Stars`), html);
    assert.ok(html.includes(String(getPlan("month").days)));
    assert.doesNotMatch(html, /\$4\.99|\{stars\}|\{days\}/);
  });
}

test("advertised monthly amount follows the plan instead of a second price constant", () => {
  const html = renderAd("en", 2345);
  assert.ok(html.includes("2,345 Stars"), html);
  assert.ok(html.includes("45 days"), html);
  assert.ok(!html.includes("1,000 Stars"));
});

test("premium users still do not receive the advertisement", () => {
  assert.equal(renderAd("fr", undefined, true), "");
});

test("the FAQ directs readers to the tariff instead of promising a contradictory price or features", () => {
  const { default: Page } = loadAppModule<{ default: ComponentType }>(
    "src/app/(default)/qu-est-ce-que-lumengallery/page.tsx",
    { "@/components/LocalizedLink": { LocalizedLink: "a" } },
  );
  const html = renderToStaticMarkup(createElement(Page));
  assert.doesNotMatch(html, /\$4\.99|options avancées/);
  assert.match(html, /Stars Telegram/);
});
