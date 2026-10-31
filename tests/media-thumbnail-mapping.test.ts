import assert from "node:assert/strict";
import test from "node:test";
import type { Photo } from "../src/lib/types";
import type { MediaSitemapEntry } from "../src/lib/sitemap-xml";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const row = {
  id: "photo-id", source_id: 42, creator_handle: "alice", creator_name: "Alice",
  creator_avatar: "/avatar.webp", creator_verified: 0, creator_url_version: 1,
  title: "Stored title", description: "Stored description", image_url: "/media/clip.mp4",
  preview_url: "/media/preview.webp", video_url: "/media/clip.mp4", type: "video",
  created_at: "2026-10-28T08:15:30.000Z", url_version: 1, width: 100, height: 100,
};

function projectedRow(sql: string) {
  return sql.includes("p.preview_url") ? row : { ...row, preview_url: undefined };
}

test("MariaDB photo mapping carries the stored preview URL without changing its media type", async () => {
  const pool = {
    execute: async (sql: string) => [sql.includes("p.image_url") ? [projectedRow(sql)] : []],
    query: async () => [[]],
  };
  const { MariaDBProvider } = loadAppModule<{ MariaDBProvider: new () => { getPhoto: (id: string) => Promise<Photo> } }>("src/lib/providers/mariadb.ts", {
    "../db-pool": { requireDbPool: () => pool }, "server-only": {},
  });
  const photo = await new MariaDBProvider().getPhoto("42");
  assert.equal(photo.previewUrl, row.preview_url);
  assert.equal(photo.imageUrl, row.image_url);
  assert.equal(photo.videoUrl, row.video_url);
});

test("sitemap projection and route preserve the same real preview used by page metadata", async () => {
  const pool = { query: async (sql: string) => [[projectedRow(sql)]] };
  const { getPopularSitemapMedia } = loadAppModule<{ getPopularSitemapMedia: (limit: number) => Promise<Photo[]> }>("src/lib/sitemap-data.ts", {
    "./db-pool": { requireDbPool: () => pool }, "server-only": {},
  });
  const [photo] = await getPopularSitemapMedia(1);
  const { toMediaSitemapEntry } = loadAppModule<{ toMediaSitemapEntry: (photo: Photo, site: string) => { previewUrl?: string } }>("src/lib/sitemap-route.ts", { "server-only": {} });
  assert.equal(photo.previewUrl, row.preview_url);
  assert.equal(toMediaSitemapEntry(photo, "https://leakfanhub.com").previewUrl, "https://leakfanhub.com/media/preview.webp");
});

test("malformed optional sitemap assets cannot hide a valid page or its usable thumbnail", () => {
  const { toMediaSitemapEntry } = loadAppModule<{ toMediaSitemapEntry: (photo: Photo, site: string) => MediaSitemapEntry }>("src/lib/sitemap-route.ts", { "server-only": {} });
  const { renderMediaSitemap } = loadAppModule<{ renderMediaSitemap: (entries: MediaSitemapEntry[]) => string }>("src/lib/sitemap-xml.ts");
  const photo: Photo = {
    id: "fixture", sourceId: "42", creatorHandle: "alice", title: "Stored title", type: "video",
    imageUrl: "/poster.webp", videoUrl: "/clip.mp4", createdAt: "2026-10-28T08:15:30.000Z",
    width: 100, height: 100, tags: [], views: 0, likes: 0, ageMinutes: 0, trending: 0,
  };
  for (const previewUrl of ["https://[invalid", "javascript:poster.jpg", "data:image/jpeg;base64,AAAA", "   "]) {
    const entry = toMediaSitemapEntry({ ...photo, previewUrl }, "https://leakfanhub.com");
    assert.equal(entry.previewUrl, undefined);
    const xml = renderMediaSitemap([entry]);
    assert.match(xml, /<loc>https:\/\/leakfanhub\.com\/alice\/42<\/loc>/);
    assert.match(xml, /<video:thumbnail_loc>https:\/\/leakfanhub\.com\/poster\.webp<\/video:thumbnail_loc>/);
  }
  const fallback = toMediaSitemapEntry({ ...photo, imageUrl: "https://[invalid", previewUrl: "/preview.webp", videoUrl: "javascript:clip.mp4" }, "https://leakfanhub.com");
  assert.equal(fallback.imageUrl, undefined);
  assert.equal(fallback.videoUrl, undefined);
  assert.match(renderMediaSitemap([fallback]), /<image:loc>https:\/\/leakfanhub\.com\/preview\.webp<\/image:loc>/);
  assert.doesNotMatch(renderMediaSitemap([fallback]), /<video:video>/);
  assert.throws(() => toMediaSitemapEntry(photo, "invalid canonical site"), TypeError);
});
