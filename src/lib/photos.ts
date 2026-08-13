/**
 * Query layer — delegates to DataProvider.
 * Never load full photo table in fallbacks (kills /models at scale).
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
import { cacheGet, cacheSet, cacheKey } from "./cache";

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
  seed?: number;
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
  limit?: number,
): Promise<CreatorWithStats[]> {
  const ck = cacheKey({ fn: "getModels", sort, limit: limit ?? "all" });
  const hit = cacheGet<CreatorWithStats[]>(ck);
  if (hit) return hit;

  const provider = await getProvider();
  let list: CreatorWithStats[];
  if (provider.getModels) {
    list = await provider.getModels(sort);
  } else {
    const creators = await provider.getCreators();
    list = creators.map((c) => ({
      ...c,
      photoCount: 0,
      totalViews: 0,
      totalLikes: 0,
      coverUrl: c.avatarUrl || "",
    }));
    if (sort === "followers") {
      list.sort((a, b) => b.followers - a.followers);
    } else {
      list.sort((a, b) => b.totalViews - a.totalViews || b.followers - a.followers);
    }
  }
  if (limit != null && limit > 0) list = list.slice(0, limit);
  cacheSet(ck, list, 30_000);
  return list;
}

export async function getRankings(limit = 20) {
  const provider = await getProvider();
  if (provider.getRankings) {
    return provider.getRankings(limit);
  }
  const models = await getModels("followers", limit);
  return models.map((c) => ({
    ...c,
    score: c.followers,
    views: c.totalViews,
    likes: c.totalLikes,
  }));
}

export async function getRecommendedCreators(exclude?: string, limit = 6) {
  const models = await getModels("followers", limit + 5);
  return models.filter((c) => c.handle !== exclude).slice(0, limit);
}

export async function getAllTags(): Promise<string[]> {
  const ck = "tags:all";
  const hit = cacheGet<string[]>(ck);
  if (hit) return hit;
  const tags = await (await getProvider()).getTags();
  cacheSet(ck, tags, 60_000);
  return tags;
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
