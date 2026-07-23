/**
 * Query layer — delegates to DataProvider.
 * This remains the same interface; implementation swaps based on where data comes from.
 */

import type { Photo, PhotoPage, PhotoView, SortKey, MediaType } from "./types";
import { getDataProvider } from "./data-provider";
import { ensureDataProvider } from "./bootstrap";

/** Resolve the active data provider, wiring the real DB on first use. */
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

export async function getModels(sort: "followers" | "views" = "followers") {
  const provider = await getProvider();
  const creators = await provider.getCreators();
  const photos = await provider.getAllPhotos();

  const stats = new Map<string, { views: number; likes: number }>();
  for (const p of photos) {
    const s = stats.get(p.creatorHandle) ?? { views: 0, likes: 0 };
    s.views += p.views;
    s.likes += p.likes;
    stats.set(p.creatorHandle, s);
  }

  const withStats = creators.map((c) => {
    const s = stats.get(c.handle) ?? { views: 0, likes: 0 };
    const photoCount = photos.filter((p) => p.creatorHandle === c.handle).length;
    const cover = photos.find((p) => p.creatorHandle === c.handle);
    return {
      ...c,
      photoCount,
      totalViews: s.views,
      totalLikes: s.likes,
      coverUrl: cover?.imageUrl ?? "",
    };
  });

  if (sort === "followers") {
    withStats.sort((a, b) => b.followers - a.followers);
  } else {
    withStats.sort((a, b) => b.totalViews - a.totalViews);
  }

  return withStats;
}

export async function getRankings(limit = 20) {
  const provider = await getProvider();
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

/** Attach a lightweight creator summary to a photo (for now returns minimal data). */
export function withCreator(p: Photo): PhotoView {
  return {
    ...p,
    creator: {
      handle: p.creatorHandle,
      name: "Chargement...",
      avatarUrl: "",
      verified: false,
    },
  };
}
