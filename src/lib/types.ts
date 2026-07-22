export interface Creator {
  handle: string; // unique url slug, e.g. "maya-lune"
  name: string;
  avatarUrl: string;
  bio: string;
  location: string;
  followers: number;
  verified: boolean;
}

export type MediaType = "photo" | "video";

export interface Photo {
  id: string;
  title: string;
  imageUrl: string;
  width: number;
  height: number;
  creatorHandle: string;
  tags: string[];
  views: number;
  likes: number;
  /** Minutes since the photo was published — used for "recent" sort + relative labels. */
  ageMinutes: number;
  /** Precomputed 0..100 trending score. */
  trending: number;
  /** Media kind. Videos add a play badge + duration and appear in the feed. */
  type: MediaType;
  /** Present when type === "video". imageUrl acts as the poster/thumbnail. */
  videoUrl?: string;
  /** Duration in seconds for videos. */
  durationSec?: number;
}

export type SortKey =
  | "recent"
  | "trending"
  | "popular"
  | "liked"
  | "random";

export interface CreatorSummary {
  handle: string;
  name: string;
  avatarUrl: string;
  verified: boolean;
}

/** A photo plus a lightweight summary of its creator, ready for cards. */
export interface PhotoView extends Photo {
  creator: CreatorSummary;
}

export interface PhotoPage {
  items: PhotoView[];
  nextCursor: number | null;
  total: number;
}

export interface PhotoQuery {
  sort?: SortKey;
  tag?: string;
  q?: string;
  creator?: string;
  cursor?: number;
  limit?: number;
}

export interface CreatorWithStats extends Creator {
  photoCount: number;
  totalViews: number;
  totalLikes: number;
  coverUrl: string;
}
