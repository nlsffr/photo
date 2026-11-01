// @ts-expect-error Native Node requires the explicit TypeScript suffix.
import { legacyTagPrefix, normalizeTagSlug } from "../seo-policy.ts";

export const RELATED_TAG_LIMIT = 6;
export const RELATED_CANDIDATES_PER_MATCH = 100;

/** Rank within at most 1,200 indexed candidates, not every matching media row. */
export function buildRelatedCandidatePlan(input: readonly unknown[]) {
  const tags = [...new Set(input.map(normalizeTagSlug).filter(
    (tag): tag is string => Boolean(tag),
  ))].slice(0, RELATED_TAG_LIMIT);
  if (tags.length === 0) return null;

  const arms: string[] = [];
  const params: string[] = [];
  for (const tag of tags) {
    arms.push(`(SELECT photo_id FROM photo_tags FORCE INDEX (idx_photo_tags_tag_id)
      WHERE tag = ? ORDER BY photo_id LIMIT ${RELATED_CANDIDATES_PER_MATCH})`);
    params.push(tag);
    arms.push(`(SELECT photo_id FROM photo_tags FORCE INDEX (idx_photo_tags_tag_id)
      WHERE tag LIKE ? LIMIT ${RELATED_CANDIDATES_PER_MATCH})`);
    params.push(legacyTagPrefix(tag)!);
  }
  return {
    fromSql: `FROM (${arms.join("\nUNION DISTINCT\n")}) matched
      STRAIGHT_JOIN photos p ON p.id = matched.photo_id
      STRAIGHT_JOIN creators c ON c.id = p.creator_id`,
    params,
  };
}
