import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Dictionary = Record<string, unknown>;

function leaves(value: Dictionary, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === "string") return [[path, entry]];
    assert.ok(entry && typeof entry === "object", `${path} must contain text`);
    return Object.entries(leaves(entry as Dictionary, path));
  }));
}

test("every dictionary has complete, nonempty UI text and preserves placeholders", () => {
  const english = loadAppModule<{ enDictionary: Dictionary }>(
    "src/lib/i18n/dictionaries/en.ts",
  ).enDictionary;
  const expected = leaves(english);

  for (const locale of ["fr", "es", "de", "it", "pt", "nl"]) {
    const loaded = loadAppModule<Record<string, Dictionary>>(
      `src/lib/i18n/dictionaries/${locale}.ts`,
    );
    const actual = leaves(loaded[`${locale}Dictionary`]);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), locale);
    for (const [key, value] of Object.entries(actual)) {
      assert.ok(value.trim().length > 0, `${locale}.${key} is empty`);
      assert.deepEqual(
        value.match(/\{[^}]+\}/g) || [],
        expected[key].match(/\{[^}]+\}/g) || [],
        `${locale}.${key} must preserve substitution placeholders`,
      );
    }
    for (const page of ["home", "models", "trending", "mostLiked", "rankings", "influencers"]) {
      for (const field of ["title", "description"]) {
        const key = `pages.${page}.meta.${field}`;
        assert.notEqual(actual[key], expected[key], `${locale}.${key} needs translated text`);
      }
    }
  }
});
