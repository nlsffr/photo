// @ts-expect-error Node's native type stripping requires the explicit suffix.
import { activeCreatorSql } from "./providers/active-content-sql.ts";
import type { CreatorCollection } from "./creator-collections.ts";
// @ts-expect-error Node's native type stripping requires the explicit suffix.
import { CREATOR_SITEMAP_BUCKETS } from "./seo-policy.ts";

const SELECT_CREATOR = `c.handle,
            COALESCE(c.url_version, 1) AS url_version,
            c.updated_at,
            stats.last_content_at`;

export function creatorSitemapProfilesSql(collection: CreatorCollection): string {
  const eligibility = collection === "overview"
    ? "stats.media_count >= 1"
    : collection === "photos"
      ? "stats.photo_count >= 12"
      : collection === "videos"
        ? "stats.video_count >= 4"
        : "stats.media_count >= 24 AND stats.engaged_count >= 8";
  return `SET STATEMENT max_statement_time=5 FOR
     SELECT ${SELECT_CREATOR}
     FROM creators c
     STRAIGHT_JOIN creator_collection_stats stats
       ON stats.creator_id = c.id AND ${eligibility}
     WHERE ${activeCreatorSql("c")}
       AND MOD(CRC32(c.id), ${CREATOR_SITEMAP_BUCKETS}) = ?
     ORDER BY c.id
     LIMIT ?`;
}
