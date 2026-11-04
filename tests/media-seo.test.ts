// @ts-expect-error Native Node requires explicit suffixes.
import { LOCALES as ACTIVE_LOCALES } from "../src/lib/i18n/config.ts";
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

test("media fallback templates and Open Graph use every supported locale without translating source text", async () => {
  const { buildMediaPagePresentation } = await loadMediaSeo();
  const expected = {
    en: "Video by @alice on LeakFanHub",
    fr: "Vidéo de @alice sur LeakFanHub",
    es: "Vídeo de @alice en LeakFanHub",
    de: "Video von @alice auf LeakFanHub",
    it: "Video di @alice su LeakFanHub",
    pt: "Vídeo de @alice no LeakFanHub",
    nl: "Video van @alice op LeakFanHub",
    ru: "Видео от @alice на LeakFanHub",
    zh: "@alice 在 LeakFanHub 上的视频",
    ja: "動画：@aliceのLeakFanHub投稿",
    hi: "वीडियो · @alice की LeakFanHub पोस्ट",
    th: "วิดีโอ โดย @alice บน LeakFanHub",
  };
  for (const locale of ACTIVE_LOCALES) {
    const context = { site: "https://leakfanhub.com", canonicalPath: "/alice/98123", locale };
    const fallback = buildMediaPagePresentation({ ...baseMedia, title: "", description: "" }, context);
    assert.ok(fallback.description.startsWith(expected[locale]), locale);
    assert.ok(fallback.name.includes("alice") && fallback.name.includes("98123"), locale);
    assert.doesNotMatch(fallback.description, /\{(?:kind|handle|id|titleDetail)\}/);
    assert.equal(fallback.metadata.openGraph.locale?.slice(0, 2), locale);
    assert.equal(fallback.metadata.openGraph.alternateLocale?.length, 11);
    const authored = buildMediaPagePresentation(baseMedia, context);
    assert.equal(authored.h1, "A real launch title", locale);
    assert.equal(authored.description, "Behind the scenes from the launch.", locale);
    assert.equal(authored.metadata.title.absolute, "A real launch title — LeakFanHub", locale);
    const literalTitle = "Original {id} $& title";
    const literal = buildMediaPagePresentation({ ...baseMedia, title: literalTitle, description: "" }, context);
    assert.ok(literal.description.includes(literalTitle), "template tokens in source text must remain literal");
  }
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

test("source identifiers never become public descriptions", async () => {
  const { buildMediaPagePresentation } = await loadMediaSeo();
  for (const description of [
    "source:98123",
    " Source : 98123 ",
    "98123",
    "photo-uuid",
    "<p>source:98123</p>",
  ]) {
    const presentation = buildMediaPagePresentation(
      { ...baseMedia, description },
      {
        site: "https://leakfanhub.com",
        canonicalPath: "/alice/98123",
        creatorName: "Alice Example",
        creatorPath: "/alice",
      },
    );

    assert.equal(
      presentation.description,
      "Video by @alice on LeakFanHub: A real launch title (media 98123).",
      description,
    );
    assert.equal(presentation.metadata.description, presentation.description);
    assert.equal(presentation.mediaLd?.description, presentation.description);
    assert.doesNotMatch(presentation.description, /^source\s*:/i);
  }
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

test("video metadata uses an existing image preview instead of an MP4 image_url", async () => {
  const { buildMediaPagePresentation } = await loadMediaSeo();
  const presentation = buildMediaPagePresentation({
    ...baseMedia,
    imageUrl: "/media/creators/alice/clip.MP4?download=1#t=0",
    previewUrl: "/media/creators/alice/preview.webp",
  }, { site: "https://leakfanhub.com", canonicalPath: "/alice/98123" });

  assert.equal(presentation.thumbnailUrl, "https://leakfanhub.com/media/creators/alice/preview.webp");
  assert.equal(presentation.mediaLd?.thumbnailUrl, presentation.thumbnailUrl);
  assert.deepEqual(presentation.metadata.openGraph.images, [{ url: presentation.thumbnailUrl }]);
  assert.deepEqual(presentation.metadata.twitter.images, [presentation.thumbnailUrl]);
  assert.equal(presentation.contentUrl, "https://leakfanhub.com/media/creators/alice/clip.mp4");
});

test("a video without an image thumbnail keeps its page but omits invalid rich media", async () => {
  const { buildMediaPagePresentation } = await loadMediaSeo();
  const presentation = buildMediaPagePresentation({
    ...baseMedia,
    imageUrl: baseMedia.videoUrl,
    previewUrl: "/media/creators/alice/preview.webm?poster=cover.jpg",
  }, { site: "https://leakfanhub.com", canonicalPath: "/alice/98123" });

  assert.equal(presentation.thumbnailUrl, undefined);
  assert.equal(presentation.mediaLd, undefined);
  assert.deepEqual(presentation.metadata.openGraph.images, []);
  assert.equal(presentation.metadata.twitter.images, undefined);
  assert.equal(presentation.metadata.robots.index, true);
  assert.equal(presentation.h1, "A real launch title");
  assert.equal(presentation.description, "Behind the scenes from the launch.");
});

test("mislabelled photo assets never produce an ImageObject pointing to a video", async () => {
  const { buildMediaSeo } = await loadMediaSeo();
  const seo = buildMediaSeo({ ...baseMedia, type: "photo", imageUrl: baseMedia.videoUrl }, "https://leakfanhub.com");
  assert.equal(seo.contentUrl, undefined);
  assert.equal(seo.structuredData, undefined);
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

test("relative asset paths without a leading slash resolve against the site", async () => {
  const { buildMediaSeo } = await loadMediaSeo();
  const seo = buildMediaSeo(
    {
      ...baseMedia,
      imageUrl: "media/creators/alice/poster.jpg",
      videoUrl: "media/creators/alice/clip.mp4",
    },
    "https://leakfanhub.com",
  );

  assert.equal(
    seo.thumbnailUrl,
    "https://leakfanhub.com/media/creators/alice/poster.jpg",
  );
  assert.equal(
    seo.contentUrl,
    "https://leakfanhub.com/media/creators/alice/clip.mp4",
  );
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
