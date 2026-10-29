export interface Creator {
  handle: string;
  name: string;
  avatarUrl: string;
  bio: string;
  location: string;
  followers: number;
  verified: boolean;
  /** Optional banner image (creators.cover_url). */
  coverUrl?: string;
  /**
   * Version publique de l'URL. 1 (défaut) = /{handle}.
   * > 1 = /{handle}-v{n}. Colonne MariaDB creators.url_version.
   */
  urlVersion?: number;
  /** ISO timestamp (creators.updated_at) — lastmod sitemap. */
  updatedAt?: string | null;
  /**
   * Si non-null, toutes les URL publiques du créateur sont retirées.
   * Colonne MariaDB creators.removed_from_index_at.
   */
  removedFromIndexAt?: string | null;
}

export type MediaType = "photo" | "video" | "pack";

export interface Photo {
  id: string;
  sourceId?: string;
  title: string;
  imageUrl: string;
  width: number;
  height: number;
  creatorHandle: string;
  tags: string[];
  views: number;
  likes: number;
  /** Popularity imported from the upstream source by ingestion. */
  sourceViews?: number;
  /** Likes imported from the upstream source by ingestion. */
  sourceLikes?: number;
  /** First-party views recorded by this site. */
  localViews?: number;
  ageMinutes: number;
  trending: number;
  type: MediaType;
  videoUrl?: string;
  durationSec?: number;
  itemCount?: number;
  externalUrl?: string;
  isAi?: boolean;
  /** photos.url_version — suffixe canonique -v{n} si > 1. */
  urlVersion?: number;
  /** ISO timestamp (photos.updated_at) — lastmod sitemap. */
  updatedAt?: string | null;
  /** Si non-null, le média est retiré de toutes les surfaces publiques. */
  removedFromIndexAt?: string | null;
}

export type SortKey =
  | "discover"
  | "recent"
  | "trending"
  | "popular"
  | "liked"
  | "random"
  | "longest";

/** Fenêtre temporelle pour trending (basée sur created_at en base). */
export type TrendWindow = "24h" | "7d" | "30d" | "all";

export interface CreatorSummary {
  handle: string;
  name: string;
  avatarUrl: string;
  verified: boolean;
  urlVersion?: number;
}

export interface PhotoView extends Photo {
  creator: CreatorSummary;
}

export interface PhotoPage {
  items: PhotoView[];
  nextCursor: number | null;
  total: number;
  seed?: number;
}

export interface PhotoQuery {
  sort?: SortKey;
  tag?: string;
  q?: string;
  creator?: string;
  type?: MediaType;
  isAi?: boolean;
  cursor?: number;
  limit?: number;
  seed?: number;
  /** Pour sort=trending : 24h | 7d | 30d | all */
  window?: TrendWindow;
}

export interface CreatorWithStats extends Creator {
  photoCount: number;
  totalViews: number;
  totalLikes: number;
  coverUrl: string;
}

export function mediaPublicId(photo: Pick<Photo, "id" | "sourceId">): string {
  return photo.sourceId && /^\d+$/.test(photo.sourceId)
    ? photo.sourceId
    : photo.id;
}

/**
 * Découpe un slug `base` ou `base-v{N}` (split sur le dernier "-v").
 * Le suffixe n'est jamais envoyé en base : source_id / handle restent la base.
 */
export function parseVersionedSlug(raw: string): { base: string; version: number | null } {
  const parts = raw.split("-v");
  if (parts.length < 2) return { base: raw, version: null };
  const suffix = parts[parts.length - 1] ?? "";
  if (!/^\d+$/.test(suffix)) return { base: raw, version: null };
  const n = Number(suffix);
  if (!Number.isInteger(n) || n < 1) return { base: raw, version: null };
  const base = parts.slice(0, -1).join("-v");
  if (!base) return { base: raw, version: null };
  return { base, version: n };
}

/** Suffixe d'URL publique. Absent quand n est absent ou <= 1. */
export function versionSuffix(urlVersion?: number | null): string {
  const n = Number(urlVersion ?? 1);
  return Number.isInteger(n) && n > 1 ? `-v${n}` : "";
}

/** Version canonique : la colonne gagne, sinon le suffixe demandé s'il est > 1. */
export function activeUrlVersion(
  entityVersion?: number | null,
  requested?: number | null,
): number {
  const fromDb = Number(entityVersion ?? 1);
  if (Number.isInteger(fromDb) && fromDb > 1) return fromDb;
  const fromUrl = Number(requested ?? 1);
  return Number.isInteger(fromUrl) && fromUrl > 1 ? fromUrl : 1;
}

/** Profile URL — /{handle} ou /{handle}-v{n} si url_version > 1. */
export function creatorHref(handle: string, urlVersion?: number | null): string {
  return `/${encodeURIComponent(handle)}${versionSuffix(urlVersion)}`;
}

export function mediaHref(
  photo: Pick<Photo, "id" | "sourceId" | "creatorHandle" | "urlVersion">,
): string {
  const id = mediaPublicId(photo);
  return `/${encodeURIComponent(photo.creatorHandle)}/${encodeURIComponent(id)}${versionSuffix(photo.urlVersion)}`;
}

export function toIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Ordered image candidates, normalized once so a failed source can fall back safely. */
export function normalizeMediaSources(
  ...sources: Array<string | null | undefined>
): string[] {
  const normalized = sources
    .map((source) => (source || "").trim())
    .filter(Boolean);
  return [...new Set(normalized)];
}
