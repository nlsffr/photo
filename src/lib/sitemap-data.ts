import "server-only";

import type { RowDataPacket } from "mysql2";
import { requireDbPool } from "./db-pool";
import { toIso, type MediaType } from "./types";
import { activeMediaSql } from "./providers/active-content-sql";
import {
  buildSitemapPartitions,
  decodeSitemapCursor,
  toMariaDbUtcTimestamp,
  type SitemapBoundary,
  type SitemapPartition,
} from "./sitemap-partitions";
import {
  CREATOR_SITEMAP_BUCKETS,
  MAX_MEDIA_SITEMAP_FILES,
  MEDIA_SITEMAP_CHUNK_SIZE,
  isSitemapPartitionDate,
} from "./seo-policy";
import {
  SITEMAP_MEDIA_SELECT,
  SITEMAP_NEXT_BOUNDARY_SQL,
  SITEMAP_PARTITION_BOUNDARIES_SQL,
  sitemapPartitionMediaSql,
} from "./sitemap-query";
import type { CreatorSitemapProfile } from "./creator-sitemap";
import type { CreatorCollection } from "./creator-collections";
import { creatorSitemapProfilesSql } from "./creator-sitemap-query";

export type SitemapMedia = {
  id: string;
  sourceId?: string;
  creatorHandle: string;
  urlVersion: number;
  updatedAt: string | null;
  createdAt: string | null;
  title: string;
  description?: string;
  imageUrl: string;
  videoUrl?: string;
  type: MediaType;
  durationSec?: number;
  views: number;
};

type SitemapMediaRow = RowDataPacket & {
  id: string;
  source_id: string | number | null;
  creator_handle: string;
  url_version: number | null;
  updated_at: Date | string | null;
  created_at: Date | string | null;
  title: string;
  description: string | null;
  image_url: string;
  video_url: string | null;
  type: MediaType;
  duration_sec: number | null;
  views_count: number | string | null;
};

type CreatorSitemapProfileRow = RowDataPacket & {
  handle: string;
  url_version: number | null;
  updated_at: Date | string | null;
  last_content_at: Date | string | null;
};

type SitemapBoundaryRow = RowDataPacket & {
  bucket_date: string;
  created_at: Date | string;
  id: string;
  next_created_at: Date | string | null;
  next_id: string | null;
  last_created_at: Date | string;
};

function mapSitemapMedia(row: SitemapMediaRow): SitemapMedia {
  return {
    id: String(row.id),
    sourceId:
      row.source_id == null || row.source_id === ""
        ? undefined
        : String(row.source_id),
    creatorHandle: row.creator_handle,
    urlVersion: Number(row.url_version) || 1,
    updatedAt: toIso(row.updated_at),
    createdAt: toIso(row.created_at),
    title: row.title,
    description: row.description ?? undefined,
    imageUrl: row.image_url,
    videoUrl: row.video_url ?? undefined,
    type: row.type,
    durationSec: row.duration_sec ?? undefined,
    views: Math.max(0, Number(row.views_count) || 0),
  };
}

export async function countIndexableMedia(): Promise<number> {
  const [rows] = await requireDbPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM photos p
     STRAIGHT_JOIN creators c ON c.id = p.creator_id
     WHERE ${activeMediaSql("p", "c")}`,
  );
  const total = Number(rows[0]?.total);
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
}

export async function getSitemapMediaChunk(
  offset: number,
  limit: number,
): Promise<SitemapMedia[]> {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.min(10_000, Math.max(1, Math.floor(limit)));
  const [rows] = await requireDbPool().query<SitemapMediaRow[]>(
    `SET STATEMENT max_statement_time=10 FOR
     SELECT ${SITEMAP_MEDIA_SELECT}
     FROM (
       SELECT candidate.id
       FROM photos candidate FORCE INDEX (idx_photos_sitemap)
       STRAIGHT_JOIN creators owner ON owner.id = candidate.creator_id
       WHERE ${activeMediaSql("candidate", "owner")}
       ORDER BY candidate.created_at DESC, candidate.id DESC
       LIMIT ? OFFSET ?
     ) page
     JOIN photos p ON p.id = page.id
     JOIN creators c ON c.id = p.creator_id
     ORDER BY p.created_at DESC, p.id DESC
    `,
    [safeLimit, safeOffset],
  );
  return rows.map(mapSitemapMedia);
}

/**
 * Return immutable keyset boundaries. Rows are ordered oldest-first inside a
 * UTC day, so normal newer inserts append without renaming existing parts.
 */
export async function getSitemapMediaPartitions(): Promise<SitemapPartition[]> {
  const [rows] = await requireDbPool().query<SitemapBoundaryRow[]>(
    SITEMAP_PARTITION_BOUNDARIES_SQL,
    [
      MEDIA_SITEMAP_CHUNK_SIZE,
      MEDIA_SITEMAP_CHUNK_SIZE,
      MAX_MEDIA_SITEMAP_FILES + 1,
    ],
  );
  if (rows.length > MAX_MEDIA_SITEMAP_FILES) {
    throw new Error("sitemap_index_capacity_exceeded");
  }
  const boundaries: SitemapBoundary[] = [];
  for (const row of rows) {
    const createdAt = toIso(row.created_at);
    if (!createdAt) throw new Error("invalid_sitemap_boundary_date");
    const nextCreatedAt = toIso(row.next_created_at);
    if ((row.next_id == null) !== (nextCreatedAt == null)) {
      throw new Error("invalid_sitemap_upper_boundary");
    }
    const lastCreatedAt = toIso(row.last_created_at);
    if (!nextCreatedAt && !lastCreatedAt) throw new Error("invalid_sitemap_last_boundary");
    boundaries.push({
      date: row.bucket_date,
      createdAt,
      id: String(row.id),
      upper: nextCreatedAt && row.next_id
        ? { createdAt: nextCreatedAt, id: String(row.next_id) }
        // created_at is TIMESTAMP(0); close the snapshot instead of opening the rest of the day.
        : { createdAt: new Date(Date.parse(lastCreatedAt!) + 1).toISOString(), id: "0" },
    });
  }
  return buildSitemapPartitions(boundaries);
}

/** Fetch one bounded partition using its immutable (created_at,id) cursor. */
export async function getSitemapMediaPartition(
  date: string,
  cursor: string,
): Promise<SitemapMedia[]> {
  if (!isSitemapPartitionDate(date)) return [];
  const boundary = decodeSitemapCursor(cursor);
  if (!boundary || boundary.createdAt.slice(0, 10) !== date) return [];
  const dayStartIso = `${date}T00:00:00.000Z`;
  const dayStart = toMariaDbUtcTimestamp(dayStartIso);
  const nextDay = toMariaDbUtcTimestamp(
    new Date(Date.parse(dayStartIso) + 86_400_000).toISOString(),
  );
  const boundaryTimestamp = toMariaDbUtcTimestamp(boundary.createdAt);
  const fixedInterval = boundary.upper !== undefined;
  // Intermediate inserts must not evict old rows from a cached interval.
  const safeLimit = fixedInterval ? 50_001 : MEDIA_SITEMAP_CHUNK_SIZE;
  const connection = await requireDbPool().getConnection();
  try {
    await connection.query("START TRANSACTION READ ONLY");
    let upper = boundary.upper;
    if (!fixedInterval) {
      const [upperRows] = await connection.query<SitemapBoundaryRow[]>(
        SITEMAP_NEXT_BOUNDARY_SQL,
        [dayStart, nextDay, boundaryTimestamp, boundaryTimestamp, boundary.id, MEDIA_SITEMAP_CHUNK_SIZE - 1],
      );
      const row = upperRows[0];
      upper = row ? { createdAt: toIso(row.created_at) ?? "", id: String(row.id) } : null;
    }
    const parameters: Array<string | number> = [
      dayStart,
      nextDay,
      boundaryTimestamp,
      boundaryTimestamp,
      boundary.id,
    ];
    if (upper) {
      const upperTimestamp = toMariaDbUtcTimestamp(
        upper.createdAt,
      );
      parameters.push(upperTimestamp, upperTimestamp, String(upper.id));
    }
    parameters.push(safeLimit);
    const [rows] = await connection.query<SitemapMediaRow[]>(
      sitemapPartitionMediaSql(Boolean(upper)),
      parameters,
    );
    if (fixedInterval && rows.length > 50_000) {
      throw new Error("sitemap_partition_capacity_exceeded");
    }
    await connection.commit();
    return rows.map(mapSitemapMedia);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getPopularSitemapMedia(
  limit: number,
): Promise<SitemapMedia[]> {
  const safeLimit = Math.min(2_000, Math.max(1, Math.floor(limit)));
  const [rows] = await requireDbPool().query<SitemapMediaRow[]>(
    `SELECT ${SITEMAP_MEDIA_SELECT}
     FROM photos p FORCE INDEX (idx_photos_views_id)
     STRAIGHT_JOIN creators c ON c.id = p.creator_id
     WHERE ${activeMediaSql("p", "c")}
     ORDER BY p.views_count DESC, p.id ASC
     LIMIT ?`,
    [safeLimit],
  );
  return rows.map(mapSitemapMedia);
}

export async function getCreatorSitemapProfiles(
  collection: CreatorCollection,
  bucket: number,
  limit = 50_001,
): Promise<CreatorSitemapProfile[]> {
  const safeBucket = Math.floor(bucket);
  if (
    !Number.isInteger(bucket)
    || safeBucket < 0
    || safeBucket >= CREATOR_SITEMAP_BUCKETS
  ) {
    throw new TypeError("Invalid creator sitemap bucket");
  }
  const safeLimit = Math.min(50_001, Math.max(1, Math.floor(limit)));
  const [rows] = await requireDbPool().query<CreatorSitemapProfileRow[]>(
    creatorSitemapProfilesSql(collection),
    [safeBucket, safeLimit],
  );
  return rows.map((row) => ({
    handle: row.handle,
    urlVersion: Number(row.url_version) || 1,
    updatedAt: toIso(row.updated_at),
    lastContentAt: toIso(row.last_content_at),
  }));
}
