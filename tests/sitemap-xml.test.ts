import assert from "node:assert/strict";
import test from "node:test";

async function loadXml() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit suffix.
    return await import("../src/lib/sitemap-xml.ts");
  } catch (error) {
    assert.fail(`sitemap XML helpers are unavailable: ${String(error)}`);
  }
}

test("media sitemap emits image and video namespaces with escaped rich fields", async () => {
  const { renderMediaSitemap } = await loadXml();
  const xml = renderMediaSitemap([
    {
      canonicalUrl: "https://leakfanhub.com/alice/98123?ref=a&b=1",
      lastmod: "2026-10-28T09:00:00.000Z",
      type: "video",
      title: "Alice & Bob <launch>",
      description: "A real <clip> & behind-the-scenes story.",
      creatorHandle: "alice",
      publicId: "98123",
      imageUrl: "https://leakfanhub.com/media/poster.jpg?x=1&y=2",
      videoUrl: "https://leakfanhub.com/media/clip.mp4?x=1&y=2",
      createdAt: "2026-10-28T08:15:30.000Z",
      durationSec: 92,
      views: 4_000,
      indexable: true,
    },
  ]);

  assert.match(xml, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(xml, /xmlns:video="http:\/\/www\.google\.com\/schemas\/sitemap-video\/1\.1"/);
  assert.match(
    xml,
    /<loc>https:\/\/leakfanhub\.com\/alice\/98123\?ref=a&amp;b=1<\/loc>/,
  );
  assert.match(xml, /<image:loc>https:\/\/leakfanhub\.com\/media\/poster\.jpg\?x=1&amp;y=2<\/image:loc>/);
  assert.match(xml, /<video:title>Alice &amp; Bob<\/video:title>/);
  assert.match(xml, /<video:description>A real &amp; behind-the-scenes story\.<\/video:description>/);
  assert.match(xml, /<video:thumbnail_loc>https:\/\/leakfanhub\.com\/media\/poster\.jpg\?x=1&amp;y=2<\/video:thumbnail_loc>/);
  assert.match(xml, /<video:content_loc>https:\/\/leakfanhub\.com\/media\/clip\.mp4\?x=1&amp;y=2<\/video:content_loc>/);
  assert.match(xml, /<video:publication_date>2026-10-28T08:15:30\.000Z<\/video:publication_date>/);
  assert.match(xml, /<video:duration>92<\/video:duration>/);
  assert.match(xml, /<video:view_count>4000<\/video:view_count>/);
});

test("image entries omit invented lastmod values and removed media", async () => {
  const { renderMediaSitemap } = await loadXml();
  const xml = renderMediaSitemap([
    {
      canonicalUrl: "https://leakfanhub.com/alice/active",
      type: "photo",
      title: "Active photo",
      description: "",
      creatorHandle: "alice",
      publicId: "active",
      imageUrl: "https://leakfanhub.com/media/active.jpg",
      indexable: true,
    },
    {
      canonicalUrl: "https://leakfanhub.com/alice/removed",
      type: "photo",
      title: "Removed photo",
      creatorHandle: "alice",
      publicId: "removed",
      imageUrl: "https://leakfanhub.com/media/removed.jpg",
      indexable: false,
    },
  ]);

  assert.match(xml, /<loc>https:\/\/leakfanhub\.com\/alice\/active<\/loc>/);
  assert.match(xml, /<image:loc>https:\/\/leakfanhub\.com\/media\/active\.jpg<\/image:loc>/);
  assert.doesNotMatch(xml, /<lastmod>/);
  assert.doesNotMatch(xml, /removed/);
});

test("canonical sitemap index renders only valid HTTP sitemap URLs", async () => {
  const { renderSitemapIndex } = await loadXml();
  const xml = renderSitemapIndex([
    "https://leakfanhub.com/sitemaps/static",
    "https://leakfanhub.com/sitemaps/media/stable/2026-10-28/a_b-c",
    "javascript:alert(1)",
  ]);

  assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/leakfanhub\.com\/sitemaps\/static<\/loc>/);
  assert.match(xml, /<loc>https:\/\/leakfanhub\.com\/sitemaps\/media\/stable\/2026-10-28\/a_b-c<\/loc>/);
  assert.doesNotMatch(xml, /javascript/);
});

test("a full worst-case media partition stays below the 50 MiB XML limit", async () => {
  const { MEDIA_SITEMAP_CHUNK_SIZE } = await import(
    // @ts-expect-error Node's native type stripping requires the explicit suffix.
    "../src/lib/seo-policy.ts"
  );
  const { renderMediaSitemap } = await loadXml();

  assert.ok(
    MEDIA_SITEMAP_CHUNK_SIZE <= 2_000,
    "the bounded serializer budget supports at most 2,000 worst-case entries",
  );
  const ampUrl = `https://cdn.example/media?${"a=1&".repeat(115)}x=1`;
  const entries = Array.from({ length: MEDIA_SITEMAP_CHUNK_SIZE }, (_, index) => ({
    canonicalUrl: `https://leakfanhub.com/alice/${index}?${"a=1&".repeat(100)}x=1`,
    lastmod: "2026-10-28T09:00:00.000Z",
    type: "video" as const,
    title: "&".repeat(160),
    description: "&".repeat(2_048),
    creatorHandle: "alice",
    publicId: String(index),
    imageUrl: ampUrl,
    videoUrl: ampUrl,
    createdAt: "2026-10-28T08:15:30.000Z",
    durationSec: 28_800,
    views: 999_999_999,
    indexable: true,
  }));
  const xml = renderMediaSitemap(entries);

  assert.ok(Buffer.byteLength(xml, "utf8") < 50 * 1024 * 1024);
});

async function loadLocalizedSitemap() {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  return import("../src/lib/i18n/sitemap.ts");
}

test("localized sitemap entries submit both translations with reciprocal alternates", async () => {
  const { buildLocalizedSitemapEntries } = await loadLocalizedSitemap();
  const entries = buildLocalizedSitemapEntries("https://leakfanhub.com");
  const englishModels = entries.find((entry) => entry.url.endsWith("/en/models"));
  const frenchModels = entries.find((entry) => entry.url.endsWith("/fr/models"));

  assert.ok(englishModels);
  assert.ok(frenchModels);
  assert.deepEqual(englishModels.alternates.languages, {
    en: "https://leakfanhub.com/en/models",
    fr: "https://leakfanhub.com/fr/models",
    es: "https://leakfanhub.com/es/models",
    de: "https://leakfanhub.com/de/models",
    it: "https://leakfanhub.com/it/models",
    pt: "https://leakfanhub.com/pt/models",
    nl: "https://leakfanhub.com/nl/models",
    "x-default": "https://leakfanhub.com/models",
  });
  assert.deepEqual(frenchModels.alternates, englishModels.alternates);
  assert.equal(entries.some((entry) => /\/[^/]+\/[^/]+-v\d+$/.test(entry.url)), false);
  assert.equal(entries.length, 58);
  assert.equal(new Set(entries.map((entry) => entry.url)).size, 58);
  for (const locale of ["es", "de", "it", "pt", "nl"]) {
    const translated = entries.filter((entry) => new URL(entry.url).pathname.startsWith(`/${locale}`));
    assert.equal(translated.length, 6);
    assert.ok(translated.every((entry) => Object.keys(entry.alternates.languages).length === 8));
  }
  const about = entries.find((entry) => entry.url.endsWith("/fr/about"));
  assert.deepEqual(about?.alternates.languages, {
    en: "https://leakfanhub.com/en/about",
    fr: "https://leakfanhub.com/fr/about",
    "x-default": "https://leakfanhub.com/about",
  });
});

test("custom static sitemap XML declares xhtml and reciprocal hreflang links", async () => {
  const { renderLocalizedStaticSitemapXml } = await loadLocalizedSitemap();
  const xml = renderLocalizedStaticSitemapXml("https://leakfanhub.com");

  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(xml, /<loc>https:\/\/leakfanhub\.com\/en<\/loc>/);
  assert.match(
    xml,
    /hreflang="fr" href="https:\/\/leakfanhub\.com\/fr"/,
  );
  assert.match(
    xml,
    /hreflang="x-default" href="https:\/\/leakfanhub\.com\/"/,
  );
  assert.doesNotMatch(xml, /<loc>https:\/\/leakfanhub\.com\/models<\/loc>/);
});
