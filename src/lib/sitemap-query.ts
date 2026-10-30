const INDEXABLE_MEDIA_SQL =
  "p.removed_from_index_at IS NULL AND c.removed_from_index_at IS NULL";

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
 * Rank physical media rows first. Removal flags only decide whether a fixed
 * partition is published; they never move the partition's keyset boundary.
 */
export const SITEMAP_PARTITION_BOUNDARIES_SQL = `WITH ranked AS (
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
         created_at,
         id,
         is_indexable,
         partition_row_num,
         FLOOR((partition_row_num - 1) / ?) AS partition_number
  FROM ranked
), active_partitions AS (
  SELECT bucket_date, partition_number
  FROM chunked
  GROUP BY bucket_date, partition_number
  HAVING SUM(is_indexable) > 0
)
SELECT media.bucket_date, media.created_at, media.id
FROM chunked media
STRAIGHT_JOIN active_partitions active
  ON active.bucket_date = media.bucket_date
 AND active.partition_number = media.partition_number
WHERE media.partition_row_num = active.partition_number * ? + 1
ORDER BY media.bucket_date DESC, media.partition_row_num ASC
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
