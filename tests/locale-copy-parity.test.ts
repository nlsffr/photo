import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { LOCALES } from "../src/lib/i18n/config.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { adsCopy } from "../src/lib/ads-copy.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { cookieCopy } from "../src/lib/audience-choice.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { DISCOVERY_COPY } from "../src/features/i18n/discovery-copy.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { SEO_LANGUAGES } from "../src/lib/seo-editor-contract.ts";

function leaves(value:unknown, path=""):Record<string,string> {
  if (typeof value === "string") return {[path]:value};
  assert.ok(value && typeof value === "object");
  return Object.fromEntries(Object.entries(value).flatMap(([key,entry]) => Object.entries(leaves(entry,path?`${path}.${key}`:key))));
}

test("all twelve locales have complete discovery, advertising and analytics choices with the same placeholders",()=>{
  assert.equal(LOCALES.length,12);
  for (const map of [DISCOVERY_COPY,adsCopy,cookieCopy]) {
    assert.deepEqual(Object.keys(map).sort(), [...LOCALES].sort());
    const expected=leaves(map.en);
    for (const locale of LOCALES) {
      const actual=leaves(map[locale]);
      assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),locale);
      for (const [key,value] of Object.entries(actual)) {
        assert.ok(value.trim(),`${locale}.${key}`);
        assert.deepEqual((value.match(/\{[^}]+\}/g)||[]).sort(),(expected[key].match(/\{[^}]+\}/g)||[]).sort(),`${locale}.${key}`);
      }
    }
  }
  assert.deepEqual(SEO_LANGUAGES.map(language=>language.code).sort(), [...LOCALES].sort());
});
