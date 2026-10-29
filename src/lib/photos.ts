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
import { parseVersionedSlug } from "./types";
import { getDataProvider } from "./data-provider";
import { ensureDataProvider } from "./bootstrap";
import { cacheGet, cacheSet } from "./cache";
import {
  createAsyncTtlCache,
  createAsyncTtlCacheMap,
} from "./async-ttl-cache";

async function getProvider() {
  await ensureDataProvider();
  return getDataProvider();
}

type PhotoQuery = {
  sort?: SortKey;
  tag?: string;
  q?: string;
  creator?: string;
  type?: MediaType;
  isAi?: boolean;
  cursor?: number;
  limit?: number;
  seed?: number;
};

const loadPhotoPage = createAsyncTtlCacheMap(async (serialized: string) => {
  const provider = await getProvider();
  return provider.getPhotos(JSON.parse(serialized) as PhotoQuery);
}, 15_000, Date.now, 300);

export async function getPhotos(query: PhotoQuery): Promise<PhotoPage> {
  if (query.sort === "random") {
    return (await getProvider()).getPhotos(query);
  }

  const normalized: PhotoQuery = {
    sort: query.sort ?? "recent",
    ...(query.tag === undefined ? {} : { tag: query.tag }),
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.creator === undefined ? {} : { creator: query.creator }),
    ...(query.type === undefined ? {} : { type: query.type }),
    ...(query.isAi === undefined ? {} : { isAi: query.isAi }),
    cursor: query.cursor ?? 0,
    limit: query.limit ?? 24,
    ...(query.seed === undefined ? {} : { seed: query.seed }),
  };
  return loadPhotoPage(JSON.stringify(normalized));
}

export async function getPhotoById(id: string): Promise<Photo | undefined> {
  // Suffixe facultatif "-v{N}" : ignoré pour la requête DB (source_id reste la base).
  const { base } = parseVersionedSlug(id);
  return (await getProvider()).getPhoto(base);
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

const loadModels = createAsyncTtlCacheMap(async (key: string) => {
  const [sortValue, limitValue, offsetValue] = key.split(":");
  const sort = sortValue === "views" ? "views" : "followers";
  const limit = Number(limitValue);
  const offset = Number(offsetValue);
  const provider = await getProvider();

  if (provider.getModels) {
    return provider.getModels(sort, limit, offset);
  }

  const creators = await provider.getCreators();
  const list: CreatorWithStats[] = creators.map((creator) => ({
    ...creator,
    photoCount: 0,
    totalViews: 0,
    totalLikes: 0,
    coverUrl: creator.avatarUrl || "",
  }));
  if (sort === "followers") {
    list.sort((a, b) => b.followers - a.followers);
  } else {
    list.sort((a, b) => b.totalViews - a.totalViews || b.followers - a.followers);
  }
  return list.slice(offset, offset + limit);
}, 30_000);

const loadModelCount = createAsyncTtlCache(async () => {
  const provider = await getProvider();
  if (provider.getModelCount) return provider.getModelCount();
  return (await provider.getCreators()).length;
}, 5 * 60_000);

export async function getModels(
  sort: "followers" | "views" = "followers",
  limit?: number,
  offset = 0,
): Promise<CreatorWithStats[]> {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit ?? 100)));
  const safeOffset = Math.min(1_000_000, Math.max(0, Math.floor(offset)));
  return loadModels(`${sort}:${safeLimit}:${safeOffset}`);
}

export async function getModelCount(): Promise<number> {
  return loadModelCount();
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
  const { base } = parseVersionedSlug(handle);
  return (await getProvider()).getCreator(base);
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
      urlVersion: creator?.urlVersion ?? 1,
    },
  };
}
