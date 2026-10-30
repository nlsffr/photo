import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const HOTSPOT_FILES = [
  "src/components/AppShell.tsx",
  "src/components/HomeFilters.tsx",
  "src/components/InternalLinks.tsx",
  "src/components/TagChips.tsx",
];

test("dense and global navigation links never trigger automatic RSC prefetch", async () => {
  for (const path of HOTSPOT_FILES) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    const openingTags = source.match(/<Link\b[\s\S]*?>/g) ?? [];
    assert.ok(openingTags.length > 0, `${path} should contain links`);
    for (const openingTag of openingTags) {
      assert.match(
        openingTag,
        /\bprefetch=\{false\}/,
        `${path} contains an automatically prefetched Link: ${openingTag}`,
      );
    }
  }
});

test("global SEO navigation links to localized public pages, never XML sitemaps", async () => {
  const source = await readFile(
    new URL("../src/components/InternalLinks.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /["']\/sitemaps(?:\/|["'])/);
  assert.match(source, /["']\/trending-medias["']/);
  assert.match(source, /["']\/models["']/);
  assert.match(source, /["']\/most-liked["']/);
  assert.match(source, /localizedHref\(locale, tag\.slug\)/);
});

