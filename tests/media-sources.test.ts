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

test("thumbnail selection keeps stored images and rejects video or unknown file types", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const { mediaThumbnailUrl } = await import("../src/lib/media-sources.ts");
  assert.equal(mediaThumbnailUrl({ imageUrl: " /media/poster.JPG?x=1#crop " }), "/media/poster.JPG?x=1#crop");
  assert.equal(mediaThumbnailUrl({ imageUrl: "/media/clip.mp4", previewUrl: "/media/preview.webp" }), "/media/preview.webp");
  assert.equal(mediaThumbnailUrl({ imageUrl: "/media/poster.jpg", previewUrl: "/media/preview.mp4" }), "/media/poster.jpg");
  for (const imageUrl of ["/clip.MP4?poster=x.jpg", "/clip.webm#poster.jpg", "/clip%2Emp4", "/media/unknown", "javascript:poster.jpg", "data:image/jpeg;base64,AAAA", "https://[invalid/poster.jpg"]) {
    assert.equal(mediaThumbnailUrl({ imageUrl, previewUrl: "/preview.mov" }), undefined, imageUrl);
  }
});
