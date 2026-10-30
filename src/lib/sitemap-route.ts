import "server-only";

import type { SitemapMedia } from "./sitemap-data";
import type { MediaSitemapEntry } from "./sitemap-xml";
import { mediaHref, mediaPublicId } from "./types";

export function toMediaSitemapEntry(
  photo: SitemapMedia,
  site: string,
): MediaSitemapEntry {
  const base = `${site.replace(/\/$/, "")}/`;
  const absolute = (value: string | undefined) =>
    value ? new URL(value, base).toString() : undefined;
  return {
    canonicalUrl: new URL(mediaHref(photo), base).toString(),
    lastmod: photo.updatedAt,
    type: photo.type,
    title: photo.title,
    description: photo.description,
    creatorHandle: photo.creatorHandle,
    publicId: mediaPublicId(photo),
    imageUrl: absolute(photo.imageUrl),
    videoUrl: absolute(photo.videoUrl),
    createdAt: photo.createdAt,
    durationSec: photo.durationSec,
    views: photo.views,
    indexable: true,
  };
}
