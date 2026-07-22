import { CREATORS, CREATOR_BY_HANDLE, PHOTOS } from "./data";
import type {
  Creator,
  CreatorWithStats,
  Photo,
  PhotoPage,
  PhotoQuery,
  PhotoView,
  SortKey,
} from "./types";

const DEFAULT_LIMIT = 30;

/** Stable pseudo-random key for a photo id (for the "Aléatoire" sort). */
function hashKey(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Attach a lightweight creator summary to a photo. */
export function withCreator(p: Photo): PhotoView {
  const c = CREATOR_BY_HANDLE.get(p.creatorHandle);
  return {
    ...p,
    creator: {
      handle: p.creatorHandle,
      name: c?.name ?? "Inconnu",
      avatarUrl: c?.avatarUrl ?? `https://i.pravatar.cc/240?u=${p.creatorHandle}`,
      verified: c?.verified ?? false,
    },
  };
}

function sorted(list: Photo[], sort: SortKey): Photo[] {
  const copy = [...list];
  switch (sort) {
    case "recent":
      return copy.sort((a, b) => a.ageMinutes - b.ageMinutes);
    case "popular":
      return copy.sort((a, b) => b.views - a.views);
    case "liked":
      return copy.sort((a, b) => b.likes - a.likes);
    case "random":
      return copy.sort((a, b) => hashKey(a.id) - hashKey(b.id));
    case "trending":
    default:
      return copy.sort((a, b) => b.trending - a.trending);
  }
}

/** Core query: filter -> sort -> paginate. Pure function over in-memory data. */
export function getPhotos(query: PhotoQuery = {}): PhotoPage {
  const {
    sort = "recent",
    tag,
    q,
    creator,
    type,
    cursor = 0,
    limit = DEFAULT_LIMIT,
  } = query;

  let list = PHOTOS;

  if (creator) list = list.filter((p) => p.creatorHandle === creator);
  if (tag) list = list.filter((p) => p.tags.includes(tag));
  if (type) list = list.filter((p) => p.type === type);

  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    list = list.filter((p) => {
      const c = CREATOR_BY_HANDLE.get(p.creatorHandle);
      return (
        p.title.toLowerCase().includes(needle) ||
        p.tags.some((t) => t.includes(needle)) ||
        (c?.name.toLowerCase().includes(needle) ?? false)
      );
    });
  }

  const ordered = sorted(list, sort);
  const start = cursor;
  const items = ordered.slice(start, start + limit).map(withCreator);
  const nextCursor = start + limit < ordered.length ? start + limit : null;

  return { items, nextCursor, total: ordered.length };
}

export function getPhotoById(id: string): Photo | undefined {
  return PHOTOS.find((p) => p.id === id);
}

/** All photos as views (creator embedded). Used by the client-side favorites page. */
export function getAllPhotoViews(): PhotoView[] {
  return PHOTOS.map(withCreator);
}

export function getCreator(handle: string): Creator | undefined {
  return CREATOR_BY_HANDLE.get(handle);
}

/** Photos that share at least one tag with the given photo (excluding itself). */
export function getRelatedPhotos(photo: Photo, limit = 12): PhotoView[] {
  return PHOTOS.filter(
    (p) => p.id !== photo.id && p.tags.some((t) => photo.tags.includes(t)),
  )
    .sort((a, b) => b.trending - a.trending)
    .slice(0, limit)
    .map(withCreator);
}

export function getCreatorStats(handle: string) {
  const photos = PHOTOS.filter((p) => p.creatorHandle === handle);
  return {
    photoCount: photos.length,
    totalViews: photos.reduce((sum, p) => sum + p.views, 0),
    totalLikes: photos.reduce((sum, p) => sum + p.likes, 0),
  };
}

/** All creators enriched with aggregate stats + a cover image (their top photo). */
export function getCreatorsWithStats(): CreatorWithStats[] {
  return CREATORS.map((c) => {
    const stats = getCreatorStats(c.handle);
    const cover = PHOTOS.filter((p) => p.creatorHandle === c.handle).sort(
      (a, b) => b.trending - a.trending,
    )[0];
    return {
      ...c,
      ...stats,
      coverUrl: cover?.imageUrl ?? c.avatarUrl,
    };
  });
}

/** Models directory, sorted by follower count (default) or total views. */
export function getModels(sort: "followers" | "views" = "followers") {
  const list = getCreatorsWithStats();
  return list.sort((a, b) =>
    sort === "views" ? b.totalViews - a.totalViews : b.followers - a.followers,
  );
}

/** Rankings — top creators by an engagement score. */
export function getRankings(limit = 20): CreatorWithStats[] {
  return getCreatorsWithStats()
    .sort((a, b) => b.totalViews + b.totalLikes * 3 - (a.totalViews + a.totalLikes * 3))
    .slice(0, limit);
}

/** A handful of recommended models for the sidebar (excludes an optional handle). */
export function getRecommendedCreators(
  exclude?: string,
  limit = 6,
): CreatorWithStats[] {
  return getCreatorsWithStats()
    .filter((c) => c.handle !== exclude)
    .sort((a, b) => b.followers - a.followers)
    .slice(0, limit);
}
