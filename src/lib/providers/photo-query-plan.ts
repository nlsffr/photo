import type { SortKey } from "../types";

type PhotoListPlanInput = {
  sort: SortKey;
  seed?: number;
  selectiveFilter?: boolean;
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
 * The leading nibble is capped at 7 so at least half of UUIDv4 rows remain
 * after the pivot, while the remaining bits still give each seed a new slice.
 */
export function seedToPhotoIdPivot(seed: number): string {
  const words: string[] = [];
  let state = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  for (let index = 0; index < 4; index += 1) {
    state = mix32((state + 0x9e3779b9 + index) >>> 0);
    words.push(state.toString(16).padStart(8, "0"));
  }
  const raw = words.join("");
  const firstNibble = (Number.parseInt(raw[0] ?? "0", 16) & 0x7).toString(16);
  const bounded = `${firstNibble}${raw.slice(1)}`;
  return `${bounded.slice(0, 8)}-${bounded.slice(8, 12)}-${bounded.slice(12, 16)}-${bounded.slice(16, 20)}-${bounded.slice(20)}`;
}

export function buildPhotoListPlan({
  sort,
  seed,
  selectiveFilter = false,
}: PhotoListPlanInput): PhotoListPlan {
  if (sort === "random") {
    const randomPivot = seedToPhotoIdPivot(seed ?? 0);
    return {
      indexName: null,
      fromSql:
        "FROM photos p STRAIGHT_JOIN creators c ON c.id = p.creator_id",
      extraWhere: "p.id >= :randomPivot",
      orderBy: "p.id ASC",
      params: { randomPivot },
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
