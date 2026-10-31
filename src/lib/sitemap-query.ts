// @ts-expect-error Node's native type stripping requires the explicit suffix.
import { activeMediaSql } from "./providers/active-content-sql.ts";

const INDEXABLE_MEDIA_SQL = activeMediaSql("p", "c");

export const SITEMAP_MEDIA_SELECT = `
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

/**
 * Rank the physical catalogue once. Retain every next boundary before hiding
 * empty partitions, so exclusions cannot move a published interval's endpoint.
 */
export const SITEMAP_PARTITION_BOUNDARIES_SQL = `SET STATEMENT max_statement_time=20 FOR
WITH ranked AS (
  SELECT DATE_FORMAT(p.created_at, '%Y-%m-%d') AS bucket_date,
         p.created_at,
         p.id,
         CASE WHEN ${INDEXABLE_MEDIA_SQL} THEN 1 ELSE 0 END AS is_indexable,
         ROW_NUMBER() OVER (
           PARTITION BY DATE(p.created_at)
           ORDER BY p.created_at ASC, p.id ASC
         ) AS partition_row_num
  FROM photos p FORCE INDEX (idx_photos_sitemap_keyset)
  STRAIGHT_JOIN creators c ON c.id = p.creator_id
), chunked AS (
  SELECT bucket_date,
         FLOOR((partition_row_num - 1) / ?) AS partition_number,
         MIN(created_at) AS created_at,
         MAX(created_at) AS last_created_at,
         MAX(CASE WHEN MOD(partition_row_num - 1, ?) = 0 THEN id END) AS id,
         MAX(is_indexable) AS has_indexable
  FROM ranked
  GROUP BY bucket_date, partition_number
), bounded AS (
  SELECT bucket_date,
         partition_number,
         created_at,
         last_created_at,
         id,
         has_indexable,
         LEAD(created_at) OVER (
           PARTITION BY bucket_date ORDER BY partition_number
         ) AS next_created_at,
         LEAD(id) OVER (
           PARTITION BY bucket_date ORDER BY partition_number
         ) AS next_id
  FROM chunked
)
SELECT bucket_date, created_at, id, last_created_at, next_created_at, next_id
FROM bounded
WHERE has_indexable > 0
ORDER BY bucket_date DESC, partition_number ASC
LIMIT ?`;

/** Locate the next fixed physical-row boundary inside the same UTC day. */
export const SITEMAP_NEXT_BOUNDARY_SQL = `SET STATEMENT max_statement_time=10 FOR
  SELECT p.created_at, p.id
  FROM photos p FORCE INDEX (idx_photos_sitemap_keyset)
  WHERE p.created_at >= ?
    AND p.created_at < ?
    AND (
      p.created_at > ?
      OR (p.created_at = ? AND p.id > ?)
    )
  ORDER BY p.created_at ASC, p.id ASC
  LIMIT ?, 1`;

/** Read one half-open [start,next-start) partition, excluding tombstones. */
export function sitemapPartitionMediaSql(hasUpperBoundary: boolean): string {
  const upperBoundary = hasUpperBoundary
    ? `AND (
         p.created_at < ?
         OR (p.created_at = ? AND p.id < ?)
       )`
    : "";
  return `SET STATEMENT max_statement_time=10 FOR
    SELECT ${SITEMAP_MEDIA_SELECT}
    FROM photos p FORCE INDEX (idx_photos_sitemap_keyset)
    STRAIGHT_JOIN creators c ON c.id = p.creator_id
    WHERE ${INDEXABLE_MEDIA_SQL}
      AND p.created_at >= ?
      AND p.created_at < ?
      AND (
        p.created_at > ?
        OR (p.created_at = ? AND p.id >= ?)
      )
      ${upperBoundary}
    ORDER BY p.created_at ASC, p.id ASC
    LIMIT ?`;
}
