/**
 * Data Provider abstraction — separates the app from the data source.
 *
 * Implement this interface to swap between demo data, MySQL, or any other source.
 */

import type { Creator, MediaType, Photo, PhotoPage, PhotoView, SortKey } from "./types";

export interface DataProvider {
  /** Get all creators. */
  getCreators(): Promise<Creator[]>;

  /** Get creator by handle. */
  getCreator(handle: string): Promise<Creator | undefined>;

  /** Get all photos (optionally filtered + sorted). */
  getPhotos(query: {
    sort?: SortKey;
    tag?: string;
    q?: string;
    creator?: string;
    type?: MediaType;
    cursor?: number;
    limit?: number;
  }): Promise<PhotoPage>;

  /** Get photo by ID. */
  getPhoto(id: string): Promise<Photo | undefined>;

  /** Get all photos with creator data embedded. */
  getAllPhotos(): Promise<PhotoView[]>;

  /** Get photos related to a given photo (by shared tags). */
  getRelatedPhotos(photo: Photo, limit?: number): Promise<PhotoView[]>;

  /** Get creator stats (photo count, total views/likes). */
  getCreatorStats(handle: string): Promise<{
    photoCount: number;
    totalViews: number;
    totalLikes: number;
  }>;

  /** Get all unique tags. */
  getTags(): Promise<string[]>;
}

/** In-memory provider (used when DB is not available). */
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
}

/** Global provider instance. Swap this with real DB provider when ready. */
let provider: DataProvider = new EmptyDataProvider();

export function setDataProvider(p: DataProvider) {
  provider = p;
}

export function getDataProvider(): DataProvider {
  return provider;
}
