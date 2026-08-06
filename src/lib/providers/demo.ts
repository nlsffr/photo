/**
 * In-memory DEMO provider — ONLY for previewing the UI locally.
 */

import type {
  Creator,
  CreatorWithStats,
  MediaType,
  Photo,
  PhotoPage,
  PhotoView,
  SortKey,
} from "../types";
import type { DataProvider } from "../data-provider";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(1234);

const FIRST = ["Aria", "Nova", "Luna", "Sasha", "Mila", "Eva", "Iris", "Noa", "Lya", "Zoe", "Kira", "Nyla", "Alba", "Ivy", "Rae", "Suki"];
const LAST = ["Lune", "Costa", "Vidal", "Rivera", "Sato", "Blanc", "Moreau", "Silva", "Faye", "Roy"];
const TAGS = ["portrait", "studio", "mode", "editorial", "beauté", "extérieur", "argentique", "couleur", "minimal", "backstage", "voyage", "lumière"];

const CREATORS: Creator[] = Array.from({ length: 24 }).map((_, i) => {
  const name = `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`;
  const handle = name.toLowerCase().replace(/\s+/g, "-") + (i > 15 ? `-${i}` : "");
  return {
    handle,
    name,
    avatarUrl: `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
    bio: "Créateur·rice sur LeakFanHub.",
    location: ["Paris", "Berlin", "Tokyo", "Milan", "Lisbonne"][i % 5],
    followers: Math.floor(rng() * 90000) + 500,
    verified: rng() < 0.4,
  };
});

const TYPES: MediaType[] = ["photo", "photo", "photo", "video", "pack"];

const PHOTOS: Photo[] = Array.from({ length: 140 }).map((_, i) => {
  const type = TYPES[Math.floor(rng() * TYPES.length)];
  const ratios = [
    [1080, 1350],
    [1080, 1080],
    [1080, 1620],
    [1080, 720],
    [1080, 1440],
  ];
  const [w, h] = ratios[Math.floor(rng() * ratios.length)];
  const creator = CREATORS[Math.floor(rng() * CREATORS.length)];
  const nTags = 1 + Math.floor(rng() * 3);
  const tags = Array.from({ length: nTags }, () => TAGS[Math.floor(rng() * TAGS.length)]);
  return {
    id: `demo-${i}`,
    title: ["Séance studio", "Portrait naturel", "Éditorial mode", "En extérieur", "Backstage"][i % 5],
    imageUrl: `https://picsum.photos/seed/leak${i}/${w}/${h}`,
    width: w,
    height: h,
    creatorHandle: creator.handle,
    tags: [...new Set(tags)],
    views: Math.floor(rng() * 500000),
    likes: Math.floor(rng() * 40000),
    ageMinutes: Math.floor(rng() * 60 * 24 * 30),
    trending: Math.floor(rng() * 100),
    type,
    videoUrl: type === "video" ? "#" : undefined,
    durationSec: type === "video" ? 8 + Math.floor(rng() * 120) : undefined,
    itemCount: type === "pack" ? 5 + Math.floor(rng() * 40) : undefined,
    externalUrl: type === "pack" || rng() < 0.2 ? "https://example.com/full" : undefined,
    isAi: rng() < 0.15,
  };
});

const BY_HANDLE = new Map(CREATORS.map((c) => [c.handle, c]));

function withCreator(p: Photo): PhotoView {
  const c = BY_HANDLE.get(p.creatorHandle);
  return {
    ...p,
    creator: {
      handle: p.creatorHandle,
      name: c?.name ?? p.creatorHandle,
      avatarUrl: c?.avatarUrl ?? "",
      verified: c?.verified ?? false,
    },
  };
}

function hashId(id: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

const SORTERS: Record<SortKey, (a: Photo, b: Photo) => number> = {
  recent: (a, b) => a.ageMinutes - b.ageMinutes || (a.id < b.id ? 1 : -1),
  trending: (a, b) =>
    b.views + b.likes * 3 - (a.views + a.likes * 3) || (a.id < b.id ? 1 : -1),
  popular: (a, b) => b.views - a.views || (a.id < b.id ? 1 : -1),
  liked: (a, b) => b.likes - a.likes || (a.id < b.id ? 1 : -1),
  longest: (a, b) =>
    (b.durationSec ?? 0) - (a.durationSec ?? 0) || (a.id < b.id ? 1 : -1),
  random: (a, b) => (a.id < b.id ? -1 : 1),
};

export class DemoProvider implements DataProvider {
  async getCreators() {
    return CREATORS;
  }
  async getCreator(handle: string) {
    return BY_HANDLE.get(handle);
  }
  async searchCreators(q: string, limit = 12) {
    const term = q.toLowerCase();
    return CREATORS.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.handle.toLowerCase().includes(term),
    ).slice(0, limit);
  }
  async getPhotos(query: {
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
    let list = PHOTOS.slice();
    if (query.creator) list = list.filter((p) => p.creatorHandle === query.creator);
    if (query.type) list = list.filter((p) => p.type === query.type);
    if (query.isAi === true) list = list.filter((p) => p.isAi);
    if (query.isAi === false) list = list.filter((p) => !p.isAi);
    if (query.tag) list = list.filter((p) => p.tags.includes(query.tag!));
    if (query.q) {
      const q = query.q.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.creatorHandle.toLowerCase().includes(q) ||
          (BY_HANDLE.get(p.creatorHandle)?.name.toLowerCase().includes(q) ?? false),
      );
    }
    const sort = query.sort ?? "recent";
    const seed =
      sort === "random"
        ? Number.isFinite(query.seed)
          ? (query.seed as number)
          : 424242
        : undefined;

    if (sort === "random" && seed !== undefined) {
      list.sort((a, b) => hashId(a.id, seed) - hashId(b.id, seed));
    } else {
      list.sort(SORTERS[sort]);
    }

    const cursor = query.cursor ?? 0;
    const limit = query.limit ?? 30;
    const items = list.slice(cursor, cursor + limit).map(withCreator);
    const nextCursor = cursor + limit < list.length ? cursor + limit : null;
    return { items, nextCursor, total: list.length, seed };
  }
  async getPhoto(id: string) {
    return PHOTOS.find((p) => p.id === id);
  }
  async getAllPhotos() {
    return PHOTOS.map(withCreator);
  }
  async getRelatedPhotos(photo: Photo, limit = 12) {
    return PHOTOS.filter(
      (p) => p.id !== photo.id && p.tags.some((t) => photo.tags.includes(t)),
    )
      .slice(0, limit)
      .map(withCreator);
  }
  async getCreatorStats(handle: string) {
    const list = PHOTOS.filter((p) => p.creatorHandle === handle);
    return {
      photoCount: list.length,
      totalViews: list.reduce((s, p) => s + p.views, 0),
      totalLikes: list.reduce((s, p) => s + p.likes, 0),
    };
  }
  async getTags() {
    return [...new Set(PHOTOS.flatMap((p) => p.tags))].slice(0, 40);
  }
  async getModels(sort: "followers" | "views" = "followers"): Promise<CreatorWithStats[]> {
    const photos = PHOTOS;
    const withStats = CREATORS.map((c) => {
      const list = photos.filter((p) => p.creatorHandle === c.handle);
      return {
        ...c,
        photoCount: list.length,
        totalViews: list.reduce((s, p) => s + p.views, 0),
        totalLikes: list.reduce((s, p) => s + p.likes, 0),
        coverUrl: list[0]?.imageUrl ?? "",
      };
    }).filter((c) => c.photoCount > 0);
    if (sort === "followers") withStats.sort((a, b) => b.followers - a.followers);
    else withStats.sort((a, b) => b.totalViews - a.totalViews);
    return withStats;
  }
  async getRankings(limit = 20) {
    const models = await this.getModels("views");
    return models.slice(0, limit).map((c) => ({
      ...c,
      views: c.totalViews,
      likes: c.totalLikes,
      score: c.totalViews + c.totalLikes * 3,
    }));
  }
}
