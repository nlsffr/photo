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
  ageMinutes: number;
  trending: number;
  type: MediaType;
  videoUrl?: string;
  durationSec?: number;
  itemCount?: number;
  externalUrl?: string;
  isAi?: boolean;
}

export type SortKey =
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

export function mediaHref(
  photo: Pick<Photo, "id" | "sourceId" | "creatorHandle">,
): string {
  return `/${encodeURIComponent(photo.creatorHandle)}/${encodeURIComponent(mediaPublicId(photo))}`;
}
