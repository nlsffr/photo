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
    "https://leakfanhub.com/sitemaps/media/2026-10-28/a_b-c",
    "javascript:alert(1)",
  ]);

  assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>https:\/\/leakfanhub\.com\/sitemaps\/static<\/loc>/);
  assert.match(xml, /<loc>https:\/\/leakfanhub\.com\/sitemaps\/media\/2026-10-28\/a_b-c<\/loc>/);
  assert.doesNotMatch(xml, /javascript/);
});
