/**
 * Data Provider abstraction — separates the app from the data source.
 */

import type {
  Creator,
  CreatorWithStats,
  MediaType,
  Photo,
  PhotoPage,
  PhotoView,
  SortKey,
} from "./types";

export interface DataProvider {
  getCreators(): Promise<Creator[]>;
  getCreator(handle: string): Promise<Creator | undefined>;
  getPhotos(query: {
    sort?: SortKey;
    tag?: string;
    q?: string;
    creator?: string;
    type?: MediaType;
    isAi?: boolean;
    cursor?: number;
    limit?: number;
    seed?: number;
  }): Promise<PhotoPage>;
  getPhoto(id: string): Promise<Photo | undefined>;
  getAllPhotos(): Promise<PhotoView[]>;
  getRelatedPhotos(photo: Photo, limit?: number): Promise<PhotoView[]>;
  getCreatorStats(handle: string): Promise<{
    photoCount: number;
    totalViews: number;
    totalLikes: number;
  }>;
  getTags(): Promise<string[]>;
  /** Fast aggregated models list (SQL when available). */
  getModels?(sort: "followers" | "views"): Promise<CreatorWithStats[]>;
  /** Search creators by name/handle. */
  searchCreators?(q: string, limit?: number): Promise<Creator[]>;
  getRankings?(limit?: number): Promise<
    Array<
      Creator & { score: number; views: number; likes: number }
    >
  >;
}

export class EmptyDataProvider implements DataProvider {
  async getCreators(): Promise<Creator[]> {
    return [];
  }
  async getCreator(): Promise<undefined> {
    return undefined;
  }
  async getPhotos(): Promise<PhotoPage> {
    return { items: [], nextCursor: null, total: 0 };
  }
  async getPhoto(): Promise<undefined> {
    return undefined;
  }
  async getAllPhotos(): Promise<PhotoView[]> {
    return [];
  }
  async getRelatedPhotos(): Promise<PhotoView[]> {
    return [];
  }
  async getCreatorStats() {
    return { photoCount: 0, totalViews: 0, totalLikes: 0 };
  }
  async getTags(): Promise<string[]> {
    return [];
  }
  async getModels(): Promise<CreatorWithStats[]> {
    return [];
  }
  async searchCreators(): Promise<Creator[]> {
    return [];
  }
  async getRankings() {
    return [];
  }
}

let provider: DataProvider = new EmptyDataProvider();

export function setDataProvider(p: DataProvider) {
  provider = p;
}

export function getDataProvider(): DataProvider {
  return provider;
}
