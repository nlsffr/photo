/**
 * MariaDB / MySQL implementation of DataProvider.
 *
 * Privacy notes:
 *  - The connection uses TLS when DB_SSL=true (encrypted in transit).
 *  - We never store or log visitor IPs here; this layer only reads content.
 *  - Prepared statements everywhere (no SQL injection surface).
 *
 * Activate by calling setDataProvider(new MariaDBProvider()) from a server-only
 * bootstrap when DATABASE_URL is set (see src/lib/bootstrap.ts).
 */

import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import type {
  Creator,
  MediaType,
  Photo,
  PhotoPage,
  PhotoView,
  SortKey,
} from "../types";
import type { DataProvider } from "../data-provider";

/** mysql2's named-placeholder params aren't in its public execute() overloads. */
type Params = Record<string, unknown>;

const PAGE_SIZE = 30;

function makePool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  return mysql.createPool({
    uri: url,
    // Encrypt the DB connection in transit. Point CA at your server's cert.
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
        : undefined,
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    waitForConnections: true,
    // Never log query params (they could include search terms).
    namedPlaceholders: true,
  });
}

type PhotoRow = {
  id: string;
  title: string;
  image_url: string;
  video_url: string | null;
  external_url: string | null;
  type: MediaType;
  duration_sec: number | null;
  item_count: number | null;
  width: number;
  height: number;
  views_count: number;
  likes_count: number;
  created_at: Date;
  creator_handle: string;
  creator_name: string;
  creator_avatar: string;
  creator_verified: number;
};

function rowToView(row: PhotoRow, tags: string[]): PhotoView {
  const ageMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000),
  );
  return {
    id: row.id,
    title: row.title,
    imageUrl: row.image_url,
    videoUrl: row.video_url ?? undefined,
    externalUrl: row.external_url ?? undefined,
    type: row.type,
    durationSec: row.duration_sec ?? undefined,
    itemCount: row.item_count ?? undefined,
    width: row.width,
    height: row.height,
    views: row.views_count,
    likes: row.likes_count,
    ageMinutes,
    trending: 0,
    creatorHandle: row.creator_handle,
    tags,
    creator: {
      handle: row.creator_handle,
      name: row.creator_name,
      avatarUrl: row.creator_avatar,
      verified: Boolean(row.creator_verified),
    },
  };
}

const SORT_SQL: Record<SortKey, string> = {
  recent: "p.created_at DESC",
  trending: "p.views_count + p.likes_count * 3 DESC",
  popular: "p.views_count DESC",
  liked: "p.likes_count DESC",
  random: "RAND()",
};

export class MariaDBProvider implements DataProvider {
  private pool: mysql.Pool;

  constructor() {
    this.pool = makePool();
  }

  /** Run a prepared statement with named params, returning typed rows. */
  private async q<T extends RowDataPacket>(
    sql: string,
    params?: Params,
  ): Promise<T[]> {
    const [rows] = await this.pool.execute<T[]>(
      sql,
      (params ?? {}) as never,
    );
    return rows;
  }

  private async tagsFor(photoIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (photoIds.length === 0) return map;
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT photo_id, tag FROM photo_tags WHERE photo_id IN (?)",
      [photoIds],
    );
    for (const r of rows as { photo_id: string; tag: string }[]) {
      const list = map.get(r.photo_id) ?? [];
      list.push(r.tag);
      map.set(r.photo_id, list);
    }
    return map;
  }

  async getCreators(): Promise<Creator[]> {
    const rows = await this.q<RowDataPacket>(
      "SELECT handle, name, avatar_url, bio, location, followers_count, verified FROM creators",
    );
    return rows.map((r) => ({
      handle: r.handle as string,
      name: r.name as string,
      avatarUrl: r.avatar_url as string,
      bio: (r.bio as string) ?? "",
      location: (r.location as string) ?? "",
      followers: r.followers_count as number,
      verified: Boolean(r.verified),
    }));
  }

  async getCreator(handle: string): Promise<Creator | undefined> {
    const rows = await this.q<RowDataPacket>(
      "SELECT handle, name, avatar_url, bio, location, followers_count, verified FROM creators WHERE handle = :handle LIMIT 1",
      { handle },
    );
    const r = rows[0];
    if (!r) return undefined;
    return {
      handle: r.handle as string,
      name: r.name as string,
      avatarUrl: r.avatar_url as string,
      bio: (r.bio as string) ?? "",
      location: (r.location as string) ?? "",
      followers: r.followers_count as number,
      verified: Boolean(r.verified),
    };
  }

  async getPhotos(query: {
    sort?: SortKey;
    tag?: string;
    q?: string;
    creator?: string;
    type?: MediaType;
    cursor?: number;
    limit?: number;
  }): Promise<PhotoPage> {
    const sort = query.sort ?? "recent";
    const limit = query.limit ?? PAGE_SIZE;
    const cursor = query.cursor ?? 0;

    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (query.creator) {
      where.push("c.handle = :creator");
      params.creator = query.creator;
    }
    if (query.type) {
      where.push("p.type = :type");
      params.type = query.type;
    }
    if (query.q) {
      where.push("(p.title LIKE :q OR c.name LIKE :q)");
      params.q = `%${query.q}%`;
    }
    if (query.tag) {
      where.push(
        "p.id IN (SELECT photo_id FROM photo_tags WHERE tag = :tag)",
      );
      params.tag = query.tag;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = await this.q<RowDataPacket>(
      `SELECT COUNT(*) AS n FROM photos p JOIN creators c ON c.id = p.creator_id ${whereSql}`,
      params,
    );
    const total = Number(countRows[0].n);

    const rows = await this.q<RowDataPacket>(
      `SELECT p.id, p.title, p.image_url, p.video_url, p.external_url, p.type, p.duration_sec, p.item_count,
              p.width, p.height, p.views_count, p.likes_count, p.created_at,
              c.handle AS creator_handle, c.name AS creator_name,
              c.avatar_url AS creator_avatar, c.verified AS creator_verified
       FROM photos p JOIN creators c ON c.id = p.creator_id
       ${whereSql}
       ORDER BY ${SORT_SQL[sort]}
       LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset: cursor },
    );

    const photoRows = rows as unknown as PhotoRow[];
    const tagsMap = await this.tagsFor(photoRows.map((r) => r.id));
    const items = photoRows.map((r) => rowToView(r, tagsMap.get(r.id) ?? []));

    const nextCursor = cursor + limit < total ? cursor + limit : null;
    return { items, nextCursor, total };
  }

  async getPhoto(id: string): Promise<Photo | undefined> {
    const rows = await this.q<RowDataPacket>(
      `SELECT p.id, p.title, p.image_url, p.video_url, p.external_url, p.type, p.duration_sec, p.item_count,
              p.width, p.height, p.views_count, p.likes_count, p.created_at,
              c.handle AS creator_handle, c.name AS creator_name,
              c.avatar_url AS creator_avatar, c.verified AS creator_verified
       FROM photos p JOIN creators c ON c.id = p.creator_id
       WHERE p.id = :id LIMIT 1`,
      { id },
    );
    const r = (rows as unknown as PhotoRow[])[0];
    if (!r) return undefined;
    const tagsMap = await this.tagsFor([r.id]);
    return rowToView(r, tagsMap.get(r.id) ?? []);
  }

  async getAllPhotos(): Promise<PhotoView[]> {
    const page = await this.getPhotos({ sort: "recent", limit: 1000 });
    return page.items;
  }

  async getRelatedPhotos(photo: Photo, limit = 12): Promise<PhotoView[]> {
    if (photo.tags.length === 0) return [];
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT DISTINCT p.id, p.title, p.image_url, p.video_url, p.external_url, p.type, p.duration_sec, p.item_count,
              p.width, p.height, p.views_count, p.likes_count, p.created_at,
              c.handle AS creator_handle, c.name AS creator_name,
              c.avatar_url AS creator_avatar, c.verified AS creator_verified
       FROM photos p
       JOIN creators c ON c.id = p.creator_id
       JOIN photo_tags t ON t.photo_id = p.id
       WHERE t.tag IN (?) AND p.id <> ?
       ORDER BY p.views_count + p.likes_count * 3 DESC
       LIMIT ?`,
      [photo.tags, photo.id, limit],
    );
    const photoRows = rows as unknown as PhotoRow[];
    const tagsMap = await this.tagsFor(photoRows.map((r) => r.id));
    return photoRows.map((r) => rowToView(r, tagsMap.get(r.id) ?? []));
  }

  async getCreatorStats(handle: string) {
    const rows = await this.q<RowDataPacket>(
      `SELECT COUNT(*) AS photoCount,
              COALESCE(SUM(p.views_count),0) AS totalViews,
              COALESCE(SUM(p.likes_count),0) AS totalLikes
       FROM photos p JOIN creators c ON c.id = p.creator_id
       WHERE c.handle = :handle`,
      { handle },
    );
    const r = rows[0] as unknown as Record<string, number>;
    return {
      photoCount: Number(r.photoCount),
      totalViews: Number(r.totalViews),
      totalLikes: Number(r.totalLikes),
    };
  }

  async getTags(): Promise<string[]> {
    const rows = await this.q<RowDataPacket>(
      "SELECT tag, COUNT(*) AS n FROM photo_tags GROUP BY tag ORDER BY n DESC LIMIT 40",
    );
    return (rows as unknown as { tag: string }[]).map((r) => r.tag);
  }
}
