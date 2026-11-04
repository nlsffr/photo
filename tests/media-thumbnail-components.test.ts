import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { getDictionary } from "../src/lib/i18n/dictionaries.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { mediaThumbnailUrl } from "../src/lib/media-sources.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { buildMediaSeo } from "../src/lib/media-seo.ts";
import type { MediaSitemapEntry } from "../src/lib/sitemap-xml";
import type { Photo } from "../src/lib/types";

test("VideoPlayer never sends a video URL to the browser's poster attribute", () => {
  const { VideoPlayer } = loadAppModule<{ VideoPlayer: ComponentType<{ src: string; poster?: string }> }>("src/components/VideoPlayer.tsx", {
    "./VideoPauseAd": { VideoPauseAd: () => null },
    "./LocaleProvider": { useLocale: () => ({ locale: "en", dictionary: getDictionary("en") }) },
  });
  const invalid = renderToStaticMarkup(createElement(VideoPlayer, { src: "/clip.mp4", poster: "/clip.mp4" }));
  assert.doesNotMatch(invalid, /poster=/);
  assert.match(invalid, /src="\/clip\.mp4"/);
  const valid = renderToStaticMarkup(createElement(VideoPlayer, { src: "/clip.mp4", poster: "/poster.webp" }));
  assert.match(valid, /poster="\/poster\.webp"/);
});

test("relative stored thumbnails resolve to one root asset in a localized player, JSON-LD and sitemap", () => {
  const { VideoPlayer } = loadAppModule<{ VideoPlayer: ComponentType<{ src: string; poster?: string }> }>("src/components/VideoPlayer.tsx", {
    "./VideoPauseAd": { VideoPauseAd: () => null },
    "./LocaleProvider": { useLocale: () => ({ locale: "de", dictionary: getDictionary("de") }) },
  });
  const { toMediaSitemapEntry } = loadAppModule<{ toMediaSitemapEntry: (photo: Photo, site: string) => MediaSitemapEntry }>("src/lib/sitemap-route.ts", { "server-only": {} });
  const { renderMediaSitemap } = loadAppModule<{ renderMediaSitemap: (entries: MediaSitemapEntry[]) => string }>("src/lib/sitemap-xml.ts");
  for (const previewUrl of ["media/poster.webp", "./media/poster.webp", "../media/poster.webp"]) {
    const photo: Photo = {
      id: "fixture", sourceId: "42", creatorHandle: "alice", title: "Stored title", type: "video",
      imageUrl: "/clip.mp4", videoUrl: "/clip.mp4", previewUrl, createdAt: "2026-10-28T08:15:30Z",
      width: 100, height: 100, tags: [], views: 0, likes: 0, ageMinutes: 0, trending: 0,
    };
    const poster = mediaThumbnailUrl(photo);
    assert.equal(poster, "/media/poster.webp");
    assert.equal(new URL(poster!, "https://leakfanhub.com/de/alice/42").href, "https://leakfanhub.com/media/poster.webp");
    const markup = renderToStaticMarkup(createElement(VideoPlayer, { src: "/clip.mp4", poster }));
    assert.match(markup, /poster="\/media\/poster\.webp"/);
    assert.equal(buildMediaSeo(photo, "https://leakfanhub.com", "de").structuredData?.thumbnailUrl, "https://leakfanhub.com/media/poster.webp");
    const xml = renderMediaSitemap([toMediaSitemapEntry(photo, "https://leakfanhub.com")]);
    assert.match(xml, /<video:thumbnail_loc>https:\/\/leakfanhub\.com\/media\/poster\.webp<\/video:thumbnail_loc>/);
    assert.equal(xml.includes("media.invalid"), false);
  }
  assert.equal(mediaThumbnailUrl({ imageUrl: "https://cdn.example/poster.webp?width=100#crop" }), "https://cdn.example/poster.webp?width=100#crop");
});

test("PhotoCard uses stored image preview for images while retaining the playable video", () => {
  const { PhotoCard } = loadAppModule<{ PhotoCard: ComponentType<{ photo: Record<string, unknown> }> }>("src/components/PhotoCard.tsx", {
    "./Interactions": { useInteractions: () => ({ ready: false, isLiked: () => false, isSaved: () => false }) },
    "./LocaleProvider": { useLocale: () => ({ locale: "en", dictionary: { creator: { verified: "Verified" }, aiFilters: { ai: "AI" }, mediaTypes: { pack: "Gallery" } } }) },
  });
  const markup = renderToStaticMarkup(createElement(PhotoCard, { photo: {
    id: "42", sourceId: "42", creatorHandle: "alice", title: "Stored title", type: "video",
    imageUrl: "/clip.mp4", videoUrl: "/clip.mp4", previewUrl: "/poster.webp",
    creator: { handle: "alice", name: "Alice", avatarUrl: "" }, tags: [], views: 0, likes: 0,
  } }));
  assert.match(markup, /<img[^>]+src="\/poster\.webp"/);
  assert.doesNotMatch(markup, /<img[^>]+src="\/clip\.mp4"/);
  assert.match(markup, /<video[^>]+src="\/clip\.mp4"/);
});

test("VideoPlayer controls and engagement labels use all seven active locales", () => {
  for (const locale of ["en", "fr", "es", "de", "it", "pt", "nl"] as const) {
    const dictionary = getDictionary(locale);
    const { VideoPlayer } = loadAppModule<{ VideoPlayer: ComponentType<{ src: string; title: string; views: number; likes: number }> }>("src/components/VideoPlayer.tsx", {
      "./VideoPauseAd": { VideoPauseAd: () => null },
      "./LocaleProvider": { useLocale: () => ({ locale, dictionary }) },
    });
    const markup = renderToStaticMarkup(createElement(VideoPlayer, { src: "/clip.mp4", title: "Stored title", views: 12, likes: 3 }));
    for (const label of [dictionary.feed.play, dictionary.feed.mute, dictionary.video.progress, dictionary.video.fullscreen, dictionary.video.pictureInPicture]) {
      assert.ok(markup.includes(`aria-label="${label}"`), `${locale}: control ${label}`);
    }
    assert.ok(markup.includes(dictionary.mediaDetails.views), `${locale}: view label`);
    assert.ok(markup.includes(dictionary.mediaDetails.likes), `${locale}: like label`);
    assert.ok(markup.includes("Stored title"));
  }
});
