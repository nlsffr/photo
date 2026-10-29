/**
 * MariaDB / MySQL implementation of DataProvider.
 * Algorithmes distincts par sort — pas les mêmes listes partout.
 *
 * Note perf: do NOT join bot_ingested on list queries. photos.source_id is enough.
 */

import type { Pool } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { requireDbPool } from "../db-pool";
import type {
  Creator,
  CreatorWithStats,
  CreatorCollectionStats,
  MediaType,
  Photo,
  PhotoPage,
  PhotoView,
  SortKey,
  TrendWindow,
} from "../types";
import { toIso } from "../types";
import { legacyTagPrefix, normalizeTagSlug } from "../seo-policy";
import type { DataProvider } from "../data-provider";
import { buildPhotoListPlan } from "./photo-query-plan";
import { normalizeEngagement } from "../source-engagement";
import {
  paginateHomeFeed,
  rankHomeFeed,
  resolveHomeSeed,
} from "../home-feed";
import {
  homeFeedSnapshotKey,
  homeFeedSnapshots,
} from "../home-feed-snapshot";
import { activeCreatorSql, activeMediaSql } from "./active-content-sql";

type Params = Record<string, unknown>;

const PAGE_SIZE = 24;

type PhotoRow = {
  id: string;
  source_id: number | string | null;
  title: string;
  description: string | null;
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
  source_views_count?: number | string | null;
  source_likes_count?: number | string | null;
  local_views_count?: number | string | null;
  is_ai: number | null;
  created_at: Date | string;
  url_version: number | null;
  updated_at: Date | string | null;
  removed_from_index_at: Date | string | null;
  creator_handle: string;
  creator_name: string;
  creator_avatar: string;
  creator_verified: number;
  creator_url_version: number | null;
};

function rowToView(row: PhotoRow, tags: string[]): PhotoView {
  const ageMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000),
  );
  const engagement = normalizeEngagement({
    sourceViews: row.source_views_count,
    sourceLikes: row.source_likes_count,
    localViews: row.local_views_count,
    legacyViews: row.views_count,
    legacyLikes: row.likes_count,
  });
  const { views, likes, sourceViews, sourceLikes, localViews } = engagement;
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
    description: row.description ?? undefined,
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
    sourceViews,
    sourceLikes,
    localViews,
    ageMinutes,
    trending,
    isAi: Boolean(row.is_ai),
    urlVersion: Number(row.url_version) || 1,
    updatedAt: toIso(row.updated_at),
    createdAt: toIso(row.created_at),
    removedFromIndexAt: toIso(row.removed_from_index_at),
    creatorHandle: row.creator_handle,
    tags,
    creator: {
      handle: row.creator_handle,
      name: row.creator_name,
      avatarUrl: row.creator_avatar,
      verified: Boolean(row.creator_verified),
      urlVersion: Number(row.creator_url_version) || 1,
    },
  };
}

function creatorFromRow(r: RowDataPacket): Creator {
  return {
    handle: r.handle as string,
    name: r.name as string,
    avatarUrl: (r.avatar_url as string) || "",
    coverUrl: (r.cover_url as string) || undefined,
    bio: (r.bio as string) ?? "",
    location: (r.location as string) ?? "",
    followers: Number(r.followers_count) || 0,
    verified: Boolean(r.verified),
    urlVersion: Number(r.url_version) || 1,
    updatedAt: toIso(r.updated_at),
    removedFromIndexAt: toIso(r.removed_from_index_at),
  };
}

function windowSql(window: TrendWindow | undefined): string {
  if (!window || window === "all") return "";
  if (window === "24h") return "p.created_at >= NOW() - INTERVAL 1 DAY";
  if (window === "7d") return "p.created_at >= NOW() - INTERVAL 7 DAY";
  if (window === "30d") return "p.created_at >= NOW() - INTERVAL 30 DAY";
  return "";
}

const PHOTO_SELECT = `
  p.id, p.source_id AS source_id,
  p.title, p.description, p.image_url, p.video_url, p.external_url, p.type, p.duration_sec, p.item_count,
  p.width, p.height, p.views_count, p.likes_count,
  p.source_views_count, p.source_likes_count, p.local_views_count, p.created_at,
  COALESCE(p.is_ai, 0) AS is_ai,
  COALESCE(p.url_version, 1) AS url_version,
  p.updated_at AS updated_at,
  p.removed_from_index_at AS removed_from_index_at,
  c.handle AS creator_handle, c.name AS creator_name,
  c.avatar_url AS creator_avatar, c.verified AS creator_verified,
  COALESCE(c.url_version, 1) AS creator_url_version
`;

const PHOTO_FROM = "FROM photos p JOIN creators c ON c.id = p.creator_id";

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
  private pool: Pool;

  constructor() {
    this.pool = requireDbPool();
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
      const slug = normalizeTagSlug(r.tag);
      if (!slug) continue;
      const list = map.get(r.photo_id) ?? [];
      if (!list.includes(slug)) list.push(slug);
      map.set(r.photo_id, list);
    }
    return map;
  }

  private async discoveryPageFromSnapshot(
    snapshotIds: string[],
    cursor: number,
    limit: number,
    seed: number,
  ): Promise<PhotoPage> {
    const selected: PhotoRow[] = [];
    let position = cursor;

    while (position < snapshotIds.length && selected.length < limit) {
      const needed = limit - selected.length;
      const requested = snapshotIds.slice(position, position + needed);
      position += requested.length;
      const params = Object.fromEntries(
        requested.map((id, index) => [`snapshot${index}`, id]),
      );
      const placeholders = requested
        .map((_, index) => `:snapshot${index}`)
        .join(", ");
      const rows = await this.q<RowDataPacket>(
        `SET STATEMENT max_statement_time=5 FOR
         SELECT ${PHOTO_SELECT}
         FROM photos p
         STRAIGHT_JOIN creators c ON c.id = p.creator_id
         WHERE p.id IN (${placeholders})
           AND ${activeMediaSql("p", "c")}`,
        params,
      );
      const byId = new Map(
        (rows as unknown as PhotoRow[]).map((row) => [row.id, row]),
      );
      for (const id of requested) {
        const row = byId.get(id);
        if (row) selected.push(row);
      }
    }

    const tagsMap = await this.tagsFor(selected.map((row) => row.id));
    return {
      items: selected.map((row) => rowToView(row, tagsMap.get(row.id) ?? [])),
      nextCursor: position < snapshotIds.length ? position : null,
      total: snapshotIds.length,
      seed,
    };
  }

  async getCreators(): Promise<Creator[]> {
    const rows = await this.q<RowDataPacket>(
      `SELECT handle, name, avatar_url, cover_url, bio, location, followers_count, verified,
              COALESCE(url_version, 1) AS url_version, updated_at, removed_from_index_at
       FROM creators c
       WHERE ${activeCreatorSql("c")}`,
    );
    return rows.map((r) => creatorFromRow(r));
  }

  async getCreator(handle: string): Promise<Creator | undefined> {
    const rows = await this.q<RowDataPacket>(
      "SELECT handle, name, avatar_url, cover_url, bio, location, followers_count, verified, COALESCE(url_version, 1) AS url_version, updated_at, removed_from_index_at FROM creators WHERE handle = :handle LIMIT 1",
      { handle },
    );
    const r = rows[0];
    if (!r) return undefined;
    return creatorFromRow(r);
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
      `SELECT handle, name, avatar_url, cover_url, bio, location, followers_count, verified,
              COALESCE(url_version, 1) AS url_version, updated_at, removed_from_index_at
       FROM creators
       WHERE ${activeCreatorSql("creators")}
         AND (handle LIKE :prefix OR name LIKE :prefix
          OR handle LIKE :mid OR name LIKE :mid
          OR handle LIKE :head OR name LIKE :head)
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
        urlVersion: Number(r.url_version) || 1,
        updatedAt: toIso(r.updated_at),
        removedFromIndexAt: toIso(r.removed_from_index_at),
        _score: score,
      });
    }

    scored.sort((a, b) => b._score - a._score || b.followers - a.followers);
    return scored.slice(0, lim).map(({ _score, ...creator }) => {
      void _score;
      return creator;
    });
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
      sort === "random" || sort === "discover"
        ? resolveHomeSeed(query.seed)
        : undefined;

    const tag = query.tag ? normalizeTagSlug(query.tag) : null;
    const legacyTag = tag ? legacyTagPrefix(tag) : null;
    if (query.tag && (!tag || !legacyTag)) {
      return { items: [], nextCursor: null, total: 0, seed };
    }

    const selectiveFilter = Boolean(
      query.creator || query.tag || query.q || query.isAi === true,
    );
    const plan = buildPhotoListPlan({
      sort,
      seed,
      selectiveFilter,
      textSearch: Boolean(query.q),
      discoveryFilters: {
        creator: query.creator,
        type: query.type,
        tag: tag ?? undefined,
        legacyTag: legacyTag ?? undefined,
        isAi: query.isAi,
      },
    });
    const where: string[] = plan.extraWhere ? [plan.extraWhere] : [];
    where.push(activeMediaSql("p", "c"));
    const params: Record<string, unknown> = { ...plan.params };
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
      where.push(
        "p.id IN (SELECT photo_id FROM photo_tags WHERE tag = :tag OR tag LIKE :legacyTag)",
      );
      params.tag = tag;
      params.legacyTag = legacyTag;
    }

    if (sort === "trending") {
      const w = windowSql(query.window ?? "30d");
      if (w) where.push(w);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // limit+1 avoids COUNT(*) on every page (critical at 100k–1M+ rows)
    const lim = Math.min(Math.max(Number(limit) || PAGE_SIZE, 1), 100);
    const off = Math.max(Number(cursor) || 0, 0);

    const discovery = sort === "discover";
    const snapshotKey = discovery && seed !== undefined
      ? homeFeedSnapshotKey({
          seed,
          creator: query.creator,
          type: query.type,
          tag: tag ?? undefined,
          isAi: query.isAi,
          q: query.q,
        })
      : null;
    const frozenIds = snapshotKey ? homeFeedSnapshots.get(snapshotKey) : undefined;
    if (frozenIds && seed !== undefined) {
      return this.discoveryPageFromSnapshot(frozenIds, off, lim, seed);
    }

    const rows = await this.q<RowDataPacket>(
      `SET STATEMENT max_statement_time=5 FOR
       SELECT ${PHOTO_SELECT}
       ${plan.fromSql}
       ${whereSql}
       ORDER BY ${plan.orderBy}
       LIMIT ${discovery ? 1200 : lim + 1}${discovery ? "" : ` OFFSET ${off}`}`,
      params,
    );

    const photoRowsAll = rows as unknown as PhotoRow[];
    if (discovery && seed !== undefined) {
      const ranked = rankHomeFeed(
        photoRowsAll.map((row) => rowToView(row, [])),
        { seed },
      );
      if (snapshotKey) {
        homeFeedSnapshots.set(snapshotKey, ranked.map((item) => item.id));
      }
      const page = paginateHomeFeed(ranked, {
        cursor: off,
        limit: lim,
        seed,
      });
      const tagsMap = await this.tagsFor(page.items.map((item) => item.id));
      return {
        ...page,
        items: page.items.map((item) => ({
          ...item,
          tags: tagsMap.get(item.id) ?? [],
        })),
      };
    }
    const hasMore = photoRowsAll.length > lim;
    const photoRows = hasMore ? photoRowsAll.slice(0, lim) : photoRowsAll;
    const tagsMap = await this.tagsFor(photoRows.map((r) => r.id));
    const items = photoRows.map((r) => rowToView(r, tagsMap.get(r.id) ?? []));

    const nextCursor = hasMore ? off + lim : null;
    const total = hasMore ? off + lim + 1 : off + items.length;
    return { items, nextCursor, total, seed };
  }

  async getPhoto(id: string): Promise<Photo | undefined> {
    const isNumeric = /^\d+$/.test(id);
    const rows = await this.q<RowDataPacket>(
      isNumeric
        ? `SELECT ${PHOTO_SELECT}
           ${PHOTO_FROM}
           WHERE p.source_id = :sid
             AND ${activeMediaSql("p", "c")}
           LIMIT 1`
        : `SELECT ${PHOTO_SELECT}
           ${PHOTO_FROM}
           WHERE p.id = :id
             AND ${activeMediaSql("p", "c")}
           LIMIT 1`,
      isNumeric ? { sid: String(id) } : { id },
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
    const tags = [...new Set(photo.tags.map(normalizeTagSlug).filter(Boolean))] as string[];
    if (tags.length === 0) {
      const page = await this.getPhotos({
        creator: photo.creatorHandle,
        sort: "popular",
        limit,
      });
      return page.items.filter((p) => p.id !== photo.id).slice(0, limit);
    }
    const legacyTags = tags
      .map(legacyTagPrefix)
      .filter((tag): tag is string => Boolean(tag));
    const tagMatches = [
      "SELECT photo_id FROM photo_tags FORCE INDEX (idx_photo_tags_tag_id) WHERE tag IN (?)",
      ...legacyTags.map(
        () =>
          "SELECT photo_id FROM photo_tags FORCE INDEX (idx_photo_tags_tag_id) WHERE tag LIKE ?",
      ),
    ].join(" UNION ");
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SET STATEMENT max_statement_time=10 FOR
       SELECT ${PHOTO_SELECT}
       FROM (${tagMatches}) matched
       JOIN photos p ON p.id = matched.photo_id
       JOIN creators c ON c.id = p.creator_id
       WHERE p.id <> ?
         AND ${activeMediaSql("p", "c")}
       ORDER BY p.views_count + p.likes_count * 3 DESC
       LIMIT ?`,
      [tags, ...legacyTags, photo.id, limit],
    );
    const photoRows = rows as unknown as PhotoRow[];
    const tagsMap = await this.tagsFor(photoRows.map((r) => r.id));
    return photoRows.map((r) => rowToView(r, tagsMap.get(r.id) ?? []));
  }

  async getCreatorCollectionContext(handle: string): Promise<{ creator: Creator; stats: CreatorCollectionStats } | undefined> {
    const rows = await this.q<RowDataPacket>(
      `SET STATEMENT max_statement_time=5 FOR
       SELECT c.handle, c.name, c.avatar_url, c.cover_url, c.bio, c.location,
              c.followers_count, c.verified, COALESCE(c.url_version, 1) AS url_version,
              c.updated_at, c.removed_from_index_at,
              COUNT(p.id) AS mediaCount,
              COALESCE(SUM(p.type = 'photo'), 0) AS photoCount,
              COALESCE(SUM(p.type = 'video'), 0) AS videoCount,
              COALESCE(SUM(COALESCE(p.source_views_count, 0) > 0 OR COALESCE(p.source_likes_count, 0) > 0), 0) AS engagedCount,
              COALESCE(SUM(COALESCE(p.source_views_count, p.views_count, 0) + COALESCE(p.local_views_count, 0)), 0) AS totalViews,
              COALESCE(SUM(COALESCE(p.source_likes_count, p.likes_count, 0)), 0) AS totalLikes
       FROM creators c
       LEFT JOIN photos p ON p.creator_id = c.id AND ${activeMediaSql("p", "c")}
       WHERE c.handle = :handle AND ${activeCreatorSql("c")}
       GROUP BY c.id, c.handle, c.name, c.avatar_url, c.cover_url, c.bio, c.location,
                c.followers_count, c.verified, c.url_version, c.updated_at, c.removed_from_index_at`,
      { handle },
    );
    const row = rows[0];
    if (!row) return undefined;
    return { creator: creatorFromRow(row), stats: {
      mediaCount: Number(row.mediaCount) || 0,
      photoCount: Number(row.photoCount) || 0,
      videoCount: Number(row.videoCount) || 0,
      engagedCount: Number(row.engagedCount) || 0,
      totalViews: Number(row.totalViews) || 0,
      totalLikes: Number(row.totalLikes) || 0,
    } };
  }

  async getCreatorCollectionStats(handle: string): Promise<CreatorCollectionStats> {
    const rows = await this.q<RowDataPacket>(
      `SET STATEMENT max_statement_time=5 FOR
       SELECT COUNT(*) AS mediaCount,
              COALESCE(SUM(p.type = 'photo'), 0) AS photoCount,
              COALESCE(SUM(p.type = 'video'), 0) AS videoCount,
              COALESCE(SUM(COALESCE(p.source_views_count, 0) > 0 OR COALESCE(p.source_likes_count, 0) > 0), 0) AS engagedCount,
              COALESCE(SUM(COALESCE(p.source_views_count, p.views_count, 0) + COALESCE(p.local_views_count, 0)), 0) AS totalViews,
              COALESCE(SUM(COALESCE(p.source_likes_count, p.likes_count, 0)), 0) AS totalLikes
       FROM photos p
       JOIN creators c ON c.id = p.creator_id
       WHERE c.handle = :handle
         AND ${activeMediaSql("p", "c")}`,
      { handle },
    );
    const row = rows[0];
    return {
      mediaCount: Number(row?.mediaCount) || 0,
      photoCount: Number(row?.photoCount) || 0,
      videoCount: Number(row?.videoCount) || 0,
      engagedCount: Number(row?.engagedCount) || 0,
      totalViews: Number(row?.totalViews) || 0,
      totalLikes: Number(row?.totalLikes) || 0,
    };
  }

  async getCreatorStats(handle: string) {
    const rows = await this.q<RowDataPacket>(
      `SELECT COALESCE(stats.photo_count, 0) AS photoCount,
              COALESCE(stats.total_views, 0) AS totalViews,
              COALESCE(stats.total_likes, 0) AS totalLikes
       FROM creators c
       LEFT JOIN creator_media_stats stats ON stats.creator_id = c.id
       WHERE c.handle = :handle
         AND ${activeCreatorSql("c")}
       LIMIT 1`,
      { handle },
    );
    const r = (rows[0] ?? {}) as unknown as Record<string, number>;
    return {
      photoCount: Number(r.photoCount),
      totalViews: Number(r.totalViews),
      totalLikes: Number(r.totalLikes),
    };
  }

  async getTags(): Promise<string[]> {
    const rows = await this.q<RowDataPacket>(
      `SELECT pt.tag, COUNT(*) AS n
       FROM photo_tags pt
       STRAIGHT_JOIN photos p ON p.id = pt.photo_id
       STRAIGHT_JOIN creators c ON c.id = p.creator_id
       WHERE ${activeMediaSql("p", "c")}
       GROUP BY pt.tag
       HAVING n >= 3
       ORDER BY n DESC
       LIMIT 200`,
    );
    return [
      ...new Set(
        (rows as unknown as { tag: string }[])
          .map((r) => normalizeTagSlug(r.tag))
          .filter((tag): tag is string => Boolean(tag)),
      ),
    ];
  }

  async getModels(
    sort: "followers" | "views" = "followers",
    limit = 100,
    offset = 0,
  ): Promise<CreatorWithStats[]> {
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 500)
      : 100;
    const safeOffset = Number.isFinite(offset)
      ? Math.min(Math.max(Math.floor(offset), 0), 1_000_000)
      : 0;
    const order =
      sort === "views"
        ? "stats.total_views DESC, c.followers_count DESC, c.id ASC"
        : "c.followers_count DESC, stats.total_views DESC, c.id ASC";
    const rows = await this.q<RowDataPacket>(
      `SET STATEMENT max_statement_time=10 FOR
       SELECT c.id AS creatorId, c.handle, c.name, c.avatar_url, c.cover_url, c.bio, c.location, c.followers_count, c.verified,
              COALESCE(c.url_version, 1) AS url_version, c.updated_at, c.removed_from_index_at,
              stats.photo_count AS photoCount,
              stats.total_views AS totalViews,
              stats.total_likes AS totalLikes,
              c.cover_url AS coverUrl
       FROM creators c
       JOIN creator_media_stats stats ON stats.creator_id = c.id
       WHERE ${activeCreatorSql("c")}
         AND stats.photo_count > 0
       ORDER BY ${order}
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    );

    const creatorIds = rows
      .map((row) => String(row.creatorId || ""))
      .filter(Boolean);
    const mediaCovers = new Map<string, string>();
    if (creatorIds.length > 0) {
      try {
        const [coverRows] = await this.pool.query<RowDataPacket[]>(
          `SET STATEMENT max_statement_time=3 FOR
           SELECT ranked.creator_id, ranked.image_url
           FROM (
             SELECT p.creator_id, p.image_url,
                    ROW_NUMBER() OVER (
                      PARTITION BY p.creator_id
                      ORDER BY p.views_count DESC, p.id ASC
                    ) AS row_number
             FROM photos p FORCE INDEX (idx_photos_creator_views)
             WHERE p.creator_id IN (?)
               AND p.removed_from_index_at IS NULL
               AND p.image_url <> ''
           ) ranked
           WHERE ranked.row_number = 1`,
          [creatorIds],
        );
        for (const cover of coverRows) {
          mediaCovers.set(
            String(cover.creator_id),
            String(cover.image_url || ""),
          );
        }
      } catch {
        // A model page remains usable with the creator cover if the optional
        // media fallback hits its short statement-time budget.
      }
    }

    return rows.map((r) => ({
      handle: r.handle as string,
      name: r.name as string,
      avatarUrl: (r.avatar_url as string) || "",
      bio: (r.bio as string) ?? "",
      location: (r.location as string) ?? "",
      followers: Number(r.followers_count) || 0,
      verified: Boolean(r.verified),
      urlVersion: Number(r.url_version) || 1,
      updatedAt: toIso(r.updated_at),
      removedFromIndexAt: toIso(r.removed_from_index_at),
      photoCount: Number(r.photoCount) || 0,
      totalViews: Number(r.totalViews) || 0,
      totalLikes: Number(r.totalLikes) || 0,
      coverUrl:
        mediaCovers.get(String(r.creatorId)) ||
        (r.coverUrl as string) ||
        "",
    }));
  }

  async getModelCount(): Promise<number> {
    const rows = await this.q<RowDataPacket>(
      `SET STATEMENT max_statement_time=10 FOR
       SELECT COUNT(*) AS total
       FROM creators c
       JOIN creator_media_stats stats ON stats.creator_id = c.id
       WHERE ${activeCreatorSql("c")}
         AND stats.photo_count > 0`,
    );
    return Math.max(0, Number(rows[0]?.total) || 0);
  }

  async getRankings(limit = 20) {
    const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const rows = await this.q<RowDataPacket>(
      `SET STATEMENT max_statement_time=5 FOR
       SELECT c.handle, c.name, c.avatar_url, c.bio, c.location, c.followers_count, c.verified,
              COALESCE(c.url_version, 1) AS url_version, c.updated_at, c.removed_from_index_at,
              COALESCE(stats.total_views, 0) AS views,
              COALESCE(stats.total_likes, 0) AS likes,
              (COALESCE(c.followers_count, 0) * 10
                + COALESCE(stats.total_views, 0)
                + COALESCE(stats.total_likes, 0) * 5) AS score
       FROM creators c
       LEFT JOIN creator_media_stats stats ON stats.creator_id = c.id
       WHERE ${activeCreatorSql("c")}
         AND (COALESCE(stats.photo_count, 0) > 0 OR COALESCE(c.followers_count, 0) > 0)
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
      urlVersion: Number(r.url_version) || 1,
      updatedAt: toIso(r.updated_at),
      removedFromIndexAt: toIso(r.removed_from_index_at),
      views: Number(r.views) || 0,
      likes: Number(r.likes) || 0,
      score: Number(r.score) || 0,
    }));
  }
}
