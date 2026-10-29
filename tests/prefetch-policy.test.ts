import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const HOTSPOT_FILES = [
  "src/app/page.tsx",
  "src/components/AppShell.tsx",
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

