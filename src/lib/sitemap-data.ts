import "server-only";

import type { RowDataPacket } from "mysql2";
import { requireDbPool } from "./db-pool";
import { toIso } from "./types";
import { activeCreatorSql, activeMediaSql } from "./providers/active-content-sql";

export type SitemapMedia = {
  id: string;
  sourceId?: string;
  creatorHandle: string;
  urlVersion: number;
  updatedAt: string | null;
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
};

type SitemapProfileRow = RowDataPacket & {
  handle: string;
  url_version: number | null;
  updated_at: Date | string | null;
};

const SITEMAP_MEDIA_SELECT = `
  p.id,
  p.source_id,
  COALESCE(p.url_version, 1) AS url_version,
  COALESCE(p.updated_at, p.created_at) AS updated_at,
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
