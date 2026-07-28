/**
 * Query layer — delegates to DataProvider.
 */

import type {
  Creator,
  CreatorWithStats,
  Photo,
  PhotoPage,
  PhotoView,
  SortKey,
  MediaType,
} from "./types";
import { getDataProvider } from "./data-provider";
import { ensureDataProvider } from "./bootstrap";

async function getProvider() {
  await ensureDataProvider();
  return getDataProvider();
}

export async function getPhotos(query: {
  sort?: SortKey;
  tag?: string;
  q?: string;
  creator?: string;
  type?: MediaType;
  isAi?: boolean;
  cursor?: number;
  limit?: number;
}): Promise<PhotoPage> {
  return (await getProvider()).getPhotos(query);
}

export async function getPhotoById(id: string): Promise<Photo | undefined> {
  return (await getProvider()).getPhoto(id);
}

export async function getAllPhotoViews(): Promise<PhotoView[]> {
  return (await getProvider()).getAllPhotos();
}

export async function getRelatedPhotos(
  photo: Photo,
  limit = 12,
): Promise<PhotoView[]> {
  return (await getProvider()).getRelatedPhotos(photo, limit);
}

export async function getCreatorStats(handle: string) {
  return (await getProvider()).getCreatorStats(handle);
}

export async function searchCreators(q: string, limit = 12): Promise<Creator[]> {
  const provider = await getProvider();
  if (provider.searchCreators) {
    return provider.searchCreators(q, limit);
  }
  const all = await provider.getCreators();
  const term = q.toLowerCase();
  return all
    .filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.handle.toLowerCase().includes(term),
    )
    .slice(0, limit);
}

export async function getModels(
  sort: "followers" | "views" = "followers",
): Promise<CreatorWithStats[]> {
  const provider = await getProvider();
  if (provider.getModels) {
    return provider.getModels(sort);
  }

  // Fallback (demo / empty)
  const creators = await provider.getCreators();
  const photos = await provider.getAllPhotos();
  const stats = new Map<string, { views: number; likes: number; cover: string }>();
  for (const p of photos) {
    const s = stats.get(p.creatorHandle) ?? { views: 0, likes: 0, cover: "" };
    s.views += p.views;
    s.likes += p.likes;
    if (!s.cover) s.cover = p.imageUrl;
    stats.set(p.creatorHandle, s);
  }
  const withStats = creators.map((c) => {
    const s = stats.get(c.handle) ?? { views: 0, likes: 0, cover: "" };
    const photoCount = photos.filter((p) => p.creatorHandle === c.handle).length;
    return {
      ...c,
      photoCount,
      totalViews: s.views,
      totalLikes: s.likes,
      coverUrl: s.cover,
    };
  }).filter((c) => c.photoCount > 0);

  if (sort === "followers") {
    withStats.sort((a, b) => b.followers - a.followers);
  } else {
    withStats.sort((a, b) => b.totalViews - a.totalViews);
  }
  return withStats;
}

export async function getRankings(limit = 20) {
  const provider = await getProvider();
  if (provider.getRankings) {
    return provider.getRankings(limit);
  }

  const creators = await provider.getCreators();
  const photos = await provider.getAllPhotos();
  const stats = new Map<string, { views: number; likes: number }>();
  for (const p of photos) {
    const s = stats.get(p.creatorHandle) ?? { views: 0, likes: 0 };
    s.views += p.views;
    s.likes += p.likes;
    stats.set(p.creatorHandle, s);
  }
  const ranked = creators.map((c) => {
    const s = stats.get(c.handle) ?? { views: 0, likes: 0 };
    const score = s.views + s.likes * 3;
    return { ...c, score, views: s.views, likes: s.likes };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

export async function getRecommendedCreators(exclude?: string, limit = 6) {
  const models = await getModels("followers");
  return models.filter((c) => c.handle !== exclude).slice(0, limit);
}

export async function getAllTags(): Promise<string[]> {
  return (await getProvider()).getTags();
}

export async function getCreator(handle: string) {
  return (await getProvider()).getCreator(handle);
}

export function withCreator(p: Photo, creator?: Creator): PhotoView {
  const fallbackName = p.creatorHandle
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  return {
    ...p,
    creator: {
      handle: p.creatorHandle,
      name: creator?.name ?? fallbackName,
      avatarUrl: creator?.avatarUrl ?? "",
      verified: creator?.verified ?? false,
    },
  };
}
