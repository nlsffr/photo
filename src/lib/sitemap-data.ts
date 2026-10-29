import "server-only";

import type { RowDataPacket } from "mysql2";
import { requireDbPool } from "./db-pool";
import { toIso, type MediaType } from "./types";
import { activeCreatorSql, activeMediaSql } from "./providers/active-content-sql";
import {
  buildSitemapPartitions,
  decodeSitemapCursor,
  type SitemapBoundary,
  type SitemapPartition,
} from "./sitemap-partitions";
import {
  MAX_MEDIA_SITEMAP_FILES,
  MEDIA_SITEMAP_CHUNK_SIZE,
  isSitemapPartitionDate,
} from "./seo-policy";

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

export type SitemapProfile = {
  handle: string;
  urlVersion: number;
  updatedAt: string | null;
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

type SitemapProfileRow = RowDataPacket & {
  handle: string;
  url_version: number | null;
  updated_at: Date | string | null;
};

type SitemapBoundaryRow = RowDataPacket & {
  bucket_date: string;
  created_at: Date | string;
  id: string;
};

const SITEMAP_MEDIA_SELECT = `
  p.id,
  p.source_id,
  COALESCE(p.url_version, 1) AS url_version,
  COALESCE(p.updated_at, p.created_at) AS updated_at,
  p.created_at,
  p.title,
  p.description,
  p.image_url,
  p.video_url,
  p.type,
  p.duration_sec,
  p.views_count,
  c.handle AS creator_handle
`;

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
    `WITH ranked AS (
       SELECT DATE_FORMAT(p.created_at, '%Y-%m-%d') AS bucket_date,
              p.created_at,
              p.id,
              ROW_NUMBER() OVER (
                PARTITION BY DATE(p.created_at)
                ORDER BY p.created_at ASC, p.id ASC
              ) AS row_number
       FROM photos p
       STRAIGHT_JOIN creators c ON c.id = p.creator_id
       WHERE ${activeMediaSql("p", "c")}
     )
     SELECT bucket_date, created_at, id
     FROM ranked
     WHERE MOD(row_number - 1, ?) = 0
     ORDER BY bucket_date DESC, row_number ASC
     LIMIT ?`,
    [MEDIA_SITEMAP_CHUNK_SIZE, MAX_MEDIA_SITEMAP_FILES],
  );
  const boundaries: SitemapBoundary[] = [];
  for (const row of rows) {
    const createdAt = toIso(row.created_at);
    if (!createdAt) continue;
    boundaries.push({
      date: row.bucket_date,
      createdAt,
      id: String(row.id),
    });
  }
  return buildSitemapPartitions(boundaries);
}

/** Fetch one bounded partition using its immutable (created_at,id) cursor. */
export async function getSitemapMediaPartition(
  date: string,
  cursor: string,
  limit = MEDIA_SITEMAP_CHUNK_SIZE,
): Promise<SitemapMedia[]> {
  if (!isSitemapPartitionDate(date)) return [];
  const boundary = decodeSitemapCursor(cursor);
  if (!boundary || boundary.createdAt.slice(0, 10) !== date) return [];
  const dayStart = `${date}T00:00:00.000Z`;
  const nextDay = new Date(Date.parse(dayStart) + 86_400_000).toISOString();
  const safeLimit = Math.min(
    MEDIA_SITEMAP_CHUNK_SIZE,
    Math.max(1, Math.floor(limit)),
  );
  const [rows] = await requireDbPool().query<SitemapMediaRow[]>(
    `SET STATEMENT max_statement_time=10 FOR
     SELECT ${SITEMAP_MEDIA_SELECT}
     FROM photos p FORCE INDEX (idx_photos_created_id)
     STRAIGHT_JOIN creators c ON c.id = p.creator_id
     WHERE ${activeMediaSql("p", "c")}
       AND p.created_at >= ?
       AND p.created_at < ?
       AND (
         p.created_at > ?
         OR (p.created_at = ? AND p.id >= ?)
       )
     ORDER BY p.created_at ASC, p.id ASC
     LIMIT ?`,
    [
      dayStart,
      nextDay,
      boundary.createdAt,
      boundary.createdAt,
      boundary.id,
      safeLimit,
    ],
  );
  return rows.map(mapSitemapMedia);
}

export async function getPopularSitemapMedia(
  limit: number,
): Promise<SitemapMedia[]> {
  const safeLimit = Math.min(2_000, Math.max(1, Math.floor(limit)));
  const [rows] = await requireDbPool().query<SitemapMediaRow[]>(
    `SELECT ${SITEMAP_MEDIA_SELECT}
     FROM photos p
     STRAIGHT_JOIN creators c ON c.id = p.creator_id
     WHERE ${activeMediaSql("p", "c")}
     ORDER BY p.views_count DESC, p.likes_count DESC, p.id DESC
     LIMIT ?`,
    [safeLimit],
  );
  return rows.map(mapSitemapMedia);
}

export async function getSitemapProfiles(): Promise<SitemapProfile[]> {
  const [rows] = await requireDbPool().query<SitemapProfileRow[]>(
    `SET STATEMENT max_statement_time=10 FOR
     SELECT c.handle,
            COALESCE(c.url_version, 1) AS url_version,
            c.updated_at
     FROM creators c
     WHERE ${activeCreatorSql("c")}
     ORDER BY c.id
     LIMIT 50000`,
  );
  return rows.map((row) => ({
    handle: row.handle,
    urlVersion: Number(row.url_version) || 1,
    updatedAt: toIso(row.updated_at),
  }));
}
