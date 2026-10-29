import type { SortKey } from "../types";

type PhotoListPlanInput = {
  sort: SortKey;
  seed?: number;
  selectiveFilter?: boolean;
  textSearch?: boolean;
};

export type PhotoListPlan = {
  indexName: string | null;
  fromSql: string;
  extraWhere: string | null;
  orderBy: string;
  params: Record<string, number | string>;
};

const INDEXED_SORTS = {
  popular: {
    indexName: "idx_photos_views_id",
    orderBy: "p.views_count DESC, p.id ASC",
  },
  recent: {
    indexName: "idx_photos_created_id",
    orderBy: "p.created_at DESC, p.id ASC",
  },
  liked: {
    indexName: "idx_photos_likes_id",
    orderBy: "p.likes_count DESC, p.id ASC",
  },
  longest: {
    indexName: "idx_photos_duration",
    orderBy: "p.duration_sec DESC, p.id DESC",
  },
} as const;

const TRENDING_CANDIDATES_SQL = `FROM (
  (SELECT pv.id
   FROM photos pv FORCE INDEX (idx_photos_views_id)
   ORDER BY pv.views_count DESC, pv.id ASC
   LIMIT 500)
  UNION DISTINCT
  (SELECT pr.id
   FROM photos pr FORCE INDEX (idx_photos_created_id)
   ORDER BY pr.created_at DESC, pr.id ASC
   LIMIT 500)
  UNION DISTINCT
  (SELECT pl.id
   FROM photos pl FORCE INDEX (idx_photos_likes_id)
   ORDER BY pl.likes_count DESC, pl.id ASC
   LIMIT 500)
) candidates
JOIN photos p ON p.id = candidates.id
STRAIGHT_JOIN creators c ON c.id = p.creator_id`;

const SEARCH_CANDIDATES_SQL = `FROM (
  (SELECT pv.id
   FROM photos pv FORCE INDEX (idx_photos_views_id)
   ORDER BY pv.views_count DESC, pv.id ASC
   LIMIT 200)
  UNION DISTINCT
  (SELECT pr.id
   FROM photos pr FORCE INDEX (idx_photos_created_id)
   ORDER BY pr.created_at DESC, pr.id ASC
   LIMIT 200)
  UNION DISTINCT
  (SELECT pt.id
   FROM photos pt
   WHERE pt.title LIKE :q
   LIMIT 500)
  UNION DISTINCT
  (SELECT ps.id
   FROM creators cs
   STRAIGHT_JOIN photos ps ON ps.creator_id = cs.id
   WHERE cs.name LIKE :q OR cs.handle LIKE :q
   LIMIT 500)
) candidates
JOIN photos p ON p.id = candidates.id
STRAIGHT_JOIN creators c ON c.id = p.creator_id`;

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

/**
 * UUID-shaped lower bound for the primary-key scan used by random galleries.
 * The caller scans away from the UUID midpoint, leaving at least half of the
 * primary-key space available while still allowing pivots across the catalog.
 */
export function seedToPhotoIdPivot(seed: number): string {
  const words: string[] = [];
  let state = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  for (let index = 0; index < 4; index += 1) {
    state = mix32((state + 0x9e3779b9 + index) >>> 0);
    words.push(state.toString(16).padStart(8, "0"));
  }
  const raw = words.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

export function buildPhotoListPlan({
  sort,
  seed,
  selectiveFilter = false,
  textSearch = false,
}: PhotoListPlanInput): PhotoListPlan {
  if (textSearch) {
    const indexed = sort in INDEXED_SORTS
      ? INDEXED_SORTS[sort as keyof typeof INDEXED_SORTS]
      : null;
    return {
      indexName: null,
      fromSql: SEARCH_CANDIDATES_SQL,
      extraWhere: null,
      orderBy: indexed?.orderBy ??
        `(p.views_count + p.likes_count * 12)
         / POW(GREATEST(TIMESTAMPDIFF(HOUR, p.created_at, NOW()), 1) / 24.0 + 2, 1.4)
         DESC, p.id ASC`,
      params: {},
    };
  }

  if (sort === "random") {
    const randomPivot = seedToPhotoIdPivot(seed ?? 0);
    const scanDescending = Number.parseInt(randomPivot[0] ?? "0", 16) >= 8;
    return {
      indexName: null,
      fromSql:
        "FROM photos p STRAIGHT_JOIN creators c ON c.id = p.creator_id",
      extraWhere: scanDescending
        ? "p.id <= :randomPivot"
        : "p.id >= :randomPivot",
      orderBy: scanDescending ? "p.id DESC" : "p.id ASC",
      params: { randomPivot },
    };
  }

  if (sort === "trending" && !selectiveFilter) {
    return {
      indexName: null,
      fromSql: TRENDING_CANDIDATES_SQL,
      extraWhere: null,
      orderBy: `(p.views_count + p.likes_count * 12)
         / POW(GREATEST(TIMESTAMPDIFF(HOUR, p.created_at, NOW()), 1) / 24.0 + 2, 1.4)
         DESC, p.id ASC`,
      params: {},
    };
  }

  const indexed = sort in INDEXED_SORTS
    ? INDEXED_SORTS[sort as keyof typeof INDEXED_SORTS]
    : null;
  const useIndex = indexed !== null && !selectiveFilter;
  const indexName = useIndex ? indexed.indexName : null;
  const fromSql = useIndex
    ? `FROM photos p FORCE INDEX (${indexName}) STRAIGHT_JOIN creators c ON c.id = p.creator_id`
    : "FROM photos p JOIN creators c ON c.id = p.creator_id";

  const orderBy = indexed?.orderBy ??
    `(p.views_count + p.likes_count * 12)
         / POW(GREATEST(TIMESTAMPDIFF(HOUR, p.created_at, NOW()), 1) / 24.0 + 2, 1.4)
         DESC, p.id ASC`;

  return {
    indexName,
    fromSql,
    extraWhere: null,
    orderBy,
    params: {},
  };
}
