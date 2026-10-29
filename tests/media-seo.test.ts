import assert from "node:assert/strict";
import test from "node:test";

async function loadMediaSeo() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit suffix.
    return await import("../src/lib/media-seo.ts");
  } catch (error) {
    assert.fail(`media SEO policy is unavailable: ${String(error)}`);
  }
}

const baseMedia = {
  id: "photo-uuid",
  sourceId: "98123",
  creatorHandle: "alice",
  title: "  A real launch title  ",
  description: "Behind the scenes from the launch.",
  imageUrl: "/media/creators/alice/poster.jpg",
  videoUrl: "/media/creators/alice/clip.mp4",
  type: "video" as const,
  createdAt: "2026-10-28T08:15:30.000Z",
  durationSec: 92,
  views: 4_000,
};

test("real database title is preferred over a generated identifier", async () => {
  const { buildMediaSeo } = await loadMediaSeo();
  const seo = buildMediaSeo(baseMedia, "https://leakfanhub.com");

  assert.equal(seo.name, "A real launch title");
  assert.equal(seo.h1, "A real launch title");
  assert.equal(seo.pageTitle, "A real launch title — LeakFanHub");
});

test("empty or markup-only titles receive a stable factual fallback", async () => {
  const { buildMediaSeo } = await loadMediaSeo();
  const seo = buildMediaSeo(
    { ...baseMedia, title: " <b> </b> ", description: "" },
    "https://leakfanhub.com",
  );

  assert.equal(seo.name, "alice video #98123");
  assert.equal(
    seo.description,
    "Video by @alice on LeakFanHub (media 98123).",
  );
});

test("description is plain factual text and remains within Google video limits", async () => {
  const { buildMediaSeo } = await loadMediaSeo();
  const seo = buildMediaSeo(
    {
      ...baseMedia,
      description: `<p>${"story & detail ".repeat(300)}</p>`,
    },
    "https://leakfanhub.com",
  );

  assert.doesNotMatch(seo.description, /[<>]/);
  assert.ok(seo.description.length <= 2_048);
  assert.ok(seo.description.startsWith("story & detail"));
});

test("video structured data includes a valid upload date and direct content URL", async () => {
  const { buildMediaSeo } = await loadMediaSeo();
  const seo = buildMediaSeo(baseMedia, "https://leakfanhub.com");

  assert.deepEqual(
    {
      type: seo.structuredData?.["@type"],
      uploadDate: seo.structuredData?.uploadDate,
      contentUrl: seo.structuredData?.contentUrl,
      thumbnailUrl: seo.structuredData?.thumbnailUrl,
      duration: seo.structuredData?.duration,
    },
    {
      type: "VideoObject",
      uploadDate: "2026-10-28T08:15:30.000Z",
      contentUrl: "https://leakfanhub.com/media/creators/alice/clip.mp4",
      thumbnailUrl: "https://leakfanhub.com/media/creators/alice/poster.jpg",
      duration: "PT1M32S",
    },
  );
  assert.equal("embedUrl" in (seo.structuredData ?? {}), false);
});

test("unsafe asset URLs never become structured-data content URLs", async () => {
  const { buildMediaSeo } = await loadMediaSeo();
  const seo = buildMediaSeo(
    { ...baseMedia, videoUrl: "javascript:alert(1)" },
    "https://leakfanhub.com",
  );

  assert.equal(seo.contentUrl, undefined);
  assert.equal(seo.structuredData, undefined);
});

test("invalid publication dates do not fabricate the required upload date", async () => {
  const { buildMediaSeo } = await loadMediaSeo();
  const seo = buildMediaSeo(
    { ...baseMedia, createdAt: "not-a-date" },
    "https://leakfanhub.com",
  );

  assert.equal(seo.uploadDate, undefined);
  assert.equal(seo.structuredData, undefined);
});

test("media page presentation keeps the real title consistent across metadata and JSON-LD", async () => {
  const { buildMediaPagePresentation } = await loadMediaSeo();
  const presentation = buildMediaPagePresentation(baseMedia, {
    site: "https://leakfanhub.com",
    canonicalPath: "/alice/98123",
    creatorName: "Alice Example",
    creatorPath: "/alice",
    creatorAvatarUrl: "/media/creators/alice/avatar.jpg",
  });

  assert.deepEqual(presentation.metadata.title, {
    absolute: "A real launch title — LeakFanHub",
  });
  assert.equal(presentation.metadata.openGraph.title, "A real launch title — LeakFanHub");
  assert.equal(presentation.metadata.alternates.canonical, "/alice/98123");
  assert.equal(presentation.h1, "A real launch title");
  assert.deepEqual(presentation.mediaLd?.author, {
    "@type": "Person",
    name: "Alice Example",
    alternateName: "alice",
    url: "https://leakfanhub.com/alice",
    image: "https://leakfanhub.com/media/creators/alice/avatar.jpg",
  });
  assert.equal(presentation.mediaLd?.uploadDate, "2026-10-28T08:15:30.000Z");
  assert.equal("embedUrl" in (presentation.mediaLd ?? {}), false);
});
