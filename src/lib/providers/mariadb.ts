/**
 * MariaDB / MySQL implementation of DataProvider.
 * Algorithmes distincts par sort — pas les mêmes listes partout.
 */

import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import type {
  Creator,
  CreatorWithStats,
  MediaType,
  Photo,
  PhotoPage,
  PhotoView,
  SortKey,
  TrendWindow,
} from "../types";
import type { DataProvider } from "../data-provider";

type Params = Record<string, unknown>;

const PAGE_SIZE = 24;

function makePool(): mysql.Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  return mysql.createPool({
    uri: url,
    ssl:
      process.env.DB_SSL === "true"
        ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA }
        : undefined,
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    waitForConnections: true,
    namedPlaceholders: true,
  });
}

type PhotoRow = {
  id: string;
  source_id: number | string | null;
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
  is_ai: number | null;
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
  const views = Number(row.views_count) || 0;
  const likes = Number(row.likes_count) || 0;
  const ageDays = Math.max(ageMinutes / 1440, 0.1);
  const velocity = (views + likes * 12) / Math.pow(ageDays + 2, 1.3);
  const trending = Math.min(100, Math.round(Math.log10(velocity + 1) * 25));
  const sid =
    row.source_id !== null && row.source_id !== undefined
      ? String(row.source_id)
      : undefined;

  return {
    id: row.id,
    sourceId: sid,
    title: row.title,
    imageUrl: row.image_url,
    videoUrl: row.video_url ?? undefined,
    externalUrl: row.external_url ?? undefined,
    type: row.type,
    durationSec: row.duration_sec ?? undefined,
    itemCount: row.item_count ?? undefined,
    width: row.width,
    height: row.height,
    views,
    likes,
    ageMinutes,
    trending,
    isAi: Boolean(row.is_ai),
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
  recent: "p.created_at DESC, p.id DESC",
  popular: "p.views_count DESC, p.likes_count DESC, p.id DESC",
  liked: "p.likes_count DESC, p.views_count DESC, p.id DESC",
  trending: `
    (p.views_count + p.likes_count * 12)
    / POW(GREATEST(TIMESTAMPDIFF(HOUR, p.created_at, NOW()), 1) / 24.0 + 2, 1.4)
    DESC, p.id DESC
  `,
  random: "RAND(:seed)",
  longest: "COALESCE(p.duration_sec, 0) DESC, p.views_count DESC, p.id DESC",
};

function windowSql(window: TrendWindow | undefined): string {
  if (!window || window === "all") return "";
  if (window === "24h") return "p.created_at >= NOW() - INTERVAL 1 DAY";
  if (window === "7d") return "p.created_at >= NOW() - INTERVAL 7 DAY";
  if (window === "30d") return "p.created_at >= NOW() - INTERVAL 30 DAY";
  return "";
}

const PHOTO_SELECT = `
  p.id, b.source_id AS source_id,
  p.title, p.image_url, p.video_url, p.external_url, p.type, p.duration_sec, p.item_count,
  p.width, p.height, p.views_count, p.likes_count, p.created_at,
  COALESCE(p.is_ai, 0) AS is_ai,
  c.handle AS creator_handle, c.name AS creator_name,
  c.avatar_url AS creator_avatar, c.verified AS creator_verified
`;

const PHOTO_FROM = `
  FROM photos p
  JOIN creators c ON c.id = p.creator_id
  LEFT JOIN bot_ingested b ON b.photo_id = p.id
`;

/** Normalize for fuzzy match: lowercase, strip non-alnum */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Simple edit distance (Levenshtein), capped for short strings */
function editDist(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

export class MariaDBProvider implements DataProvider {
  private pool: mysql.Pool;

  constructor() {
    this.pool = makePool();
  }

  private async q<T extends RowDataPacket>(
    sql: string,
    params?: Params,
  ): Promise<T[]> {
    const [rows] = await this.pool.execute<T[]>(sql, (params ?? {}) as never);
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
      "SELECT handle, name, avatar_url, cover_url, bio, location, followers_count, verified FROM creators",
    );
    return rows.map((r) => ({
      handle: r.handle as string,
      name: r.name as string,
      avatarUrl: r.avatar_url as string,
      coverUrl: (r.cover_url as string) || undefined,
      bio: (r.bio as string) ?? "",
      location: (r.location as string) ?? "",
      followers: Number(r.followers_count) || 0,
      verified: Boolean(r.verified),
    }));
  }

  async getCreator(handle: string): Promise<Creator | undefined> {
    const rows = await this.q<RowDataPacket>(
      "SELECT handle, name, avatar_url, cover_url, bio, location, followers_count, verified FROM creators WHERE handle = :handle LIMIT 1",
      { handle },
    );
    const r = rows[0];
    if (!r) return undefined;
    return {
      handle: r.handle as string,
      name: r.name as string,
      avatarUrl: r.avatar_url as string,
      coverUrl: (r.cover_url as string) || undefined,
      bio: (r.bio as string) ?? "",
      location: (r.location as string) ?? "",
      followers: Number(r.followers_count) || 0,
      verified: Boolean(r.verified),
    };
  }

  async searchCreators(q: string, limit = 12): Promise<Creator[]> {
    const raw = q.trim();
    if (!raw) return [];
    const lim = Math.min(Math.max(Number(limit) || 12, 1), 30);
    const nq = norm(raw);
    const prefix = `${raw}%`;
    const mid = `%${raw}%`;
    // Prefetch candidates: prefix, contains, first chars
    const head = raw.slice(0, Math.min(3, raw.length));
    const rows = await this.q<RowDataPacket>(
      `SELECT handle, name, avatar_url, cover_url, bio, location, followers_count, verified
       FROM creators
       WHERE handle LIKE :prefix OR name LIKE :prefix
          OR handle LIKE :mid OR name LIKE :mid
          OR handle LIKE :head OR name LIKE :head
       LIMIT 80`,
      { prefix, mid, head: `${head}%` },
    );

    type Cand = Creator & { _score: number };
    const scored: Cand[] = [];
    for (const r of rows) {
      const handle = r.handle as string;
      const name = r.name as string;
      const followers = Number(r.followers_count) || 0;
      const nh = norm(handle);
      const nn = norm(name);
      let score = 0;
      if (handle.toLowerCase() === raw.toLowerCase() || name.toLowerCase() === raw.toLowerCase()) {
        score = 1000;
      } else if (handle.toLowerCase().startsWith(raw.toLowerCase()) || name.toLowerCase().startsWith(raw.toLowerCase())) {
        score = 800;
      } else if (nh.startsWith(nq) || nn.startsWith(nq)) {
        score = 700;
      } else if (nh.includes(nq) || nn.includes(nq)) {
        score = 500;
      } else {
        // Typo tolerance on normalized strings
        const d = Math.min(editDist(nq, nh.slice(0, nq.length + 2)), editDist(nq, nn.slice(0, nq.length + 2)));
        if (d <= 2 && nq.length >= 3) score = 400 - d * 40;
        else if (d <= 1 && nq.length >= 2) score = 350;
        else continue;
      }
      // Boost popular creators
      score += Math.min(120, Math.log10(followers + 10) * 25);
      scored.push({
        handle,
        name,
        avatarUrl: r.avatar_url as string,
        coverUrl: (r.cover_url as string) || undefined,
        bio: (r.bio as string) ?? "",
        location: (r.location as string) ?? "",
        followers,
        verified: Boolean(r.verified),
        _score: score,
      });
    }

    scored.sort((a, b) => b._score - a._score || b.followers - a.followers);
    return scored.slice(0, lim).map(({ _score, ...c }) => c);
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
    window?: TrendWindow;
  }): Promise<PhotoPage> {
    const sort = query.sort ?? "recent";
    const limit = query.limit ?? PAGE_SIZE;
    const cursor = query.cursor ?? 0;
    const seed =
      sort === "random"
        ? Number.isFinite(query.seed)
          ? (query.seed as number)
          : Math.floor(Math.random() * 1_000_000)
        : undefined;

    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (seed !== undefined) params.seed = seed;
    if (query.creator) {
      where.push("c.handle = :creator");
      params.creator = query.creator;
    }
    if (query.type) {
      where.push("p.type = :type");
      params.type = query.type;
    }
    if (query.isAi === true) {
      where.push("COALESCE(p.is_ai, 0) = 1");
    } else if (query.isAi === false) {
      where.push("COALESCE(p.is_ai, 0) = 0");
    }
    if (query.q) {
      const qq = query.q.trim();
      where.push(
        "(p.title LIKE :q OR c.name LIKE :q OR c.handle LIKE :q OR c.name LIKE :q2 OR c.handle LIKE :q2)",
      );
      params.q = `%${qq}%`;
      params.q2 = `${qq}%`;
    }
    if (query.tag) {
      where.push("p.id IN (SELECT photo_id FROM photo_tags WHERE tag = :tag)");
      params.tag = query.tag;
    }

    if (sort === "trending") {
      const w = windowSql(query.window ?? "30d");
      if (w) where.push(w);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const countRows = await this.q<RowDataPacket>(
      `SELECT COUNT(*) AS n FROM photos p JOIN creators c ON c.id = p.creator_id ${whereSql}`,
      params,
    );
    const total = Number(countRows[0].n);

    const lim = Math.min(Math.max(Number(limit) || PAGE_SIZE, 1), 100);
    const off = Math.max(Number(cursor) || 0, 0);

    const rows = await this.q<RowDataPacket>(
      `SELECT ${PHOTO_SELECT}
       ${PHOTO_FROM}
       ${whereSql}
       ORDER BY ${SORT_SQL[sort]}
       LIMIT ${lim} OFFSET ${off}`,
      params,
    );

    const photoRows = rows as unknown as PhotoRow[];
    const tagsMap = await this.tagsFor(photoRows.map((r) => r.id));
    const items = photoRows.map((r) => rowToView(r, tagsMap.get(r.id) ?? []));

    const nextCursor = off + lim < total ? off + lim : null;
    return { items, nextCursor, total, seed };
  }

  async getPhoto(id: string): Promise<Photo | undefined> {
    const isNumeric = /^\d+$/.test(id);
    const rows = await this.q<RowDataPacket>(
      isNumeric
        ? `SELECT ${PHOTO_SELECT}
           ${PHOTO_FROM}
           WHERE b.source_id = :sid LIMIT 1`
        : `SELECT ${PHOTO_SELECT}
           ${PHOTO_FROM}
           WHERE p.id = :id LIMIT 1`,
      isNumeric ? { sid: Number(id) } : { id },
    );
    const r = (rows as unknown as PhotoRow[])[0];
    if (!r) return undefined;
    const tagsMap = await this.tagsFor([r.id]);
    return rowToView(r, tagsMap.get(r.id) ?? []);
  }

  async getAllPhotos(): Promise<PhotoView[]> {
    const page = await this.getPhotos({ sort: "popular", limit: 500 });
    return page.items;
  }

  async getRelatedPhotos(photo: Photo, limit = 12): Promise<PhotoView[]> {
    if (photo.tags.length === 0) {
      const page = await this.getPhotos({
        creator: photo.creatorHandle,
        sort: "popular",
        limit,
      });
      return page.items.filter((p) => p.id !== photo.id).slice(0, limit);
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT DISTINCT ${PHOTO_SELECT}
       ${PHOTO_FROM}
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

  async getModels(sort: "followers" | "views" = "followers"): Promise<CreatorWithStats[]> {
    const order =
      sort === "views" ? "totalViews DESC" : "c.followers_count DESC, totalViews DESC";
    const rows = await this.q<RowDataPacket>(
      `SELECT c.handle, c.name, c.avatar_url, c.cover_url, c.bio, c.location, c.followers_count, c.verified,
              COUNT(p.id) AS photoCount,
              COALESCE(SUM(p.views_count), 0) AS totalViews,
              COALESCE(SUM(p.likes_count), 0) AS totalLikes,
              COALESCE(
                NULLIF(c.cover_url, ''),
                (
                  SELECT p2.image_url FROM photos p2
                  WHERE p2.creator_id = c.id
                  ORDER BY p2.views_count DESC
                  LIMIT 1
                )
              ) AS coverUrl
       FROM creators c
       LEFT JOIN photos p ON p.creator_id = c.id
       GROUP BY c.id
       HAVING photoCount > 0
       ORDER BY ${order}`,
    );
    return rows.map((r) => ({
      handle: r.handle as string,
      name: r.name as string,
      avatarUrl: (r.avatar_url as string) || "",
      bio: (r.bio as string) ?? "",
      location: (r.location as string) ?? "",
      followers: Number(r.followers_count) || 0,
      verified: Boolean(r.verified),
      photoCount: Number(r.photoCount) || 0,
      totalViews: Number(r.totalViews) || 0,
      totalLikes: Number(r.totalLikes) || 0,
      coverUrl: (r.coverUrl as string) || "",
    }));
  }

  async getRankings(limit = 20) {
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const rows = await this.q<RowDataPacket>(
      `SELECT c.handle, c.name, c.avatar_url, c.bio, c.location, c.followers_count, c.verified,
              COALESCE(SUM(p.views_count), 0) AS views,
              COALESCE(SUM(p.likes_count), 0) AS likes,
              (COALESCE(c.followers_count,0) * 10
                + COALESCE(SUM(p.views_count), 0)
                + COALESCE(SUM(p.likes_count), 0) * 5) AS score
       FROM creators c
       LEFT JOIN photos p ON p.creator_id = c.id
       GROUP BY c.id
       HAVING COUNT(p.id) > 0 OR COALESCE(c.followers_count,0) > 0
       ORDER BY score DESC, c.followers_count DESC
       LIMIT ${lim}`,
    );
    return rows.map((r) => ({
      handle: r.handle as string,
      name: r.name as string,
      avatarUrl: (r.avatar_url as string) || "",
      bio: (r.bio as string) ?? "",
      location: (r.location as string) ?? "",
      followers: Number(r.followers_count) || 0,
      verified: Boolean(r.verified),
      views: Number(r.views) || 0,
      likes: Number(r.likes) || 0,
      score: Number(r.score) || 0,
    }));
  }
}
