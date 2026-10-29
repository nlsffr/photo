import assert from "node:assert/strict";
import test from "node:test";

test("keeps ordered, usable image fallbacks without duplicates", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const media = await import("../src/lib/types.ts");
  const normalizeMediaSources = (
    media as unknown as {
      normalizeMediaSources?: (
        ...sources: Array<string | null | undefined>
      ) => string[];
    }
  ).normalizeMediaSources;

  assert.equal(
    typeof normalizeMediaSources,
    "function",
    "MediaImg needs an ordered fallback-source normalizer",
  );
  assert.deepEqual(
    normalizeMediaSources?.(
      " /media/avatars/missing.webp ",
      "/media/creators/model/cover.webp",
      "/media/avatars/missing.webp",
      "",
      undefined,
    ),
    [
      "/media/avatars/missing.webp",
      "/media/creators/model/cover.webp",
    ],
  );
});
