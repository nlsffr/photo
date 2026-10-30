import type { Photo } from "./types";
import type { CreatorLocale } from "./i18n/config";
// @ts-expect-error Node’s native type stripping requires the explicit .ts suffix.
import { getDictionary } from "./i18n/dictionaries.ts";
// @ts-expect-error Node’s native type stripping requires the explicit .ts suffix.
import { isReservedCreatorHandle } from "./seo-policy.ts";

export type CreatorCollection = "overview" | "photos" | "videos" | "popular";
export interface CreatorCollectionStats {
  mediaCount: number;
  photoCount: number;
  videoCount: number;
  engagedCount: number;
  totalViews: number;
  totalLikes: number;
}

const COLLECTIONS = new Set<CreatorCollection>(["overview", "photos", "videos", "popular"]);
const HANDLE = /^[a-z0-9._-]+$/i;
const VERSION_SUFFIX = /-v\d+$/;
const PUBLIC_VERSION_SUFFIX = /^(.*)-v([1-9]\d*)$/;
const MAX_PUBLIC_HANDLE_LENGTH = 100;
const MAX_CREATOR_PAGE = 10_000;

function isSafeCreatorHandle(handle: string): boolean {
  return handle.length > 0
    && handle.length <= MAX_PUBLIC_HANDLE_LENGTH
    && handle !== "."
    && handle !== ".."
    && HANDLE.test(handle);
}

/**
 * True only when a database handle can own an unambiguous public creator URL.
 * Version-like suffixes are reserved for the URL lifecycle (`alice-v2`).
 */
export function isRoutableCreatorHandle(handle: string): boolean {
  const normalized = handle.trim();
  const lowered = normalized.toLowerCase();
  return isSafeCreatorHandle(normalized)
    && !VERSION_SUFFIX.test(normalized)
    && !isReservedCreatorHandle(lowered);
}

export function collectionIsEligible(collection: CreatorCollection, stats: CreatorCollectionStats): boolean {
  switch (collection) {
    case "overview": return stats.mediaCount >= 1;
    case "photos": return stats.photoCount >= 12;
    case "videos": return stats.videoCount >= 4;
    case "popular": return stats.mediaCount >= 24 && stats.engagedCount >= 8;
  }
}

export function summarizeCreatorCollectionStats(media: readonly Pick<Photo, "type" | "views" | "likes" | "sourceViews" | "sourceLikes">[]): CreatorCollectionStats {
  return media.reduce<CreatorCollectionStats>((stats, item) => {
    stats.mediaCount++;
    if (item.type === "photo") stats.photoCount++;
    if (item.type === "video") stats.videoCount++;
    if ((item.sourceViews ?? 0) > 0 || (item.sourceLikes ?? 0) > 0) stats.engagedCount++;
    stats.totalViews += Number.isFinite(item.views) ? item.views : 0;
    stats.totalLikes += Number.isFinite(item.likes) ? item.likes : 0;
    return stats;
  }, { mediaCount: 0, photoCount: 0, videoCount: 0, engagedCount: 0, totalViews: 0, totalLikes: 0 });
}

export function parseCreatorCollectionPath(pathname: string): { handle: string; collection: CreatorCollection } | null {
  if (typeof pathname !== "string" || pathname.includes("?")) return null;
  const rawSegments = pathname.split("/").filter(Boolean);
  if (rawSegments[0] === "en" || rawSegments[0] === "fr") rawSegments.shift();
  if (rawSegments.length !== 1 && rawSegments.length !== 2) return null;
  let handle: string;
  let segment: string;
  try {
    handle = decodeURIComponent(rawSegments[0]);
    segment = rawSegments.length === 2 ? decodeURIComponent(rawSegments[1]) : "overview";
  } catch { return null; }
  const versioned = PUBLIC_VERSION_SUFFIX.exec(handle);
  const databaseHandle = versioned?.[1] ?? handle;
  if (!isRoutableCreatorHandle(databaseHandle)) return null;
  if (!versioned && VERSION_SUFFIX.test(handle)) return null;
  if (!COLLECTIONS.has(segment as CreatorCollection)) return null;
  return { handle, collection: segment as CreatorCollection };
}

export function parseCreatorPage(raw: string | string[] | null | undefined): { page: number; valid: boolean } {
  if (raw == null || raw === "") return { page: 1, valid: true };
  if (Array.isArray(raw) || !/^\d+$/.test(raw)) return { page: 1, valid: false };
  const page = Number(raw);
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_CREATOR_PAGE) return { page: 1, valid: false };
  return { page, valid: true };
}

export function creatorCollectionPath(handle: string, urlVersion: number, collection: CreatorCollection, locale?: CreatorLocale, page?: number): string {
  const safeHandle = handle.trim();
  if (!isRoutableCreatorHandle(safeHandle)) throw new TypeError("Invalid creator handle");
  if (!COLLECTIONS.has(collection)) throw new TypeError("Invalid collection");
  const version = Number.isInteger(urlVersion) && urlVersion > 1 ? urlVersion : 1;
  const encodedHandle = encodeURIComponent(safeHandle);
  const versionedHandle = version > 1 ? `${encodedHandle}-v${version}` : encodedHandle;
  const prefix = locale === "en" || locale === "fr" ? `/${locale}` : "";
  const suffix = Number.isInteger(page) && (page as number) >= 2 ? `?page=${page}` : "";
  const collectionPath = collection === "overview" ? `/${versionedHandle}` : `/${versionedHandle}/${collection}`;
  return `${prefix}${collectionPath}${suffix}`;
}

export function creatorCollectionCopy(locale: CreatorLocale, collection: CreatorCollection, name: string) {
  const copy = getDictionary(locale).creator.collections[collection];
  return { title: copy.title.replace("{name}", () => name), description: copy.description.replace("{name}", () => name) };
}
export function creatorCollectionMetadata(handle: string, collection: CreatorCollection, locale: CreatorLocale = "en") {
  const copy = creatorCollectionCopy(locale, collection, handle);
  return { title: copy.title, description: copy.description };
}
