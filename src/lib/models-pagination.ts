export const MODELS_PAGE_SIZE = 60;

export type ModelsSort = "followers" | "views";

export type ModelsSearchParams = Record<string, string | string[] | undefined>;

export function parseModelsSearch(searchParams: ModelsSearchParams): {
  sort: ModelsSort;
  page: number;
  offset: number;
} {
  const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
  const sort = first(searchParams.sort) === "views" ? "views" : "followers";
  const parsedPage = Number.parseInt(first(searchParams.page) || "1", 10);
  // getModels bounds offsets at one million; larger pages would repeat that slice.
  const maxPage = Math.floor(1_000_000 / MODELS_PAGE_SIZE) + 1;
  const page = Number.isSafeInteger(parsedPage) && parsedPage >= 1 && parsedPage <= maxPage
    ? parsedPage
    : 1;
  return { sort, page, offset: (page - 1) * MODELS_PAGE_SIZE };
}

export function modelsPagePath(
  pathname: string,
  search: { sort: ModelsSort; page: number },
): string {
  const query = new URLSearchParams();
  if (search.sort === "views") query.set("sort", "views");
  if (search.page > 1) query.set("page", String(search.page));
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

export type ModelsPageRequest = {
  sort: ModelsSort;
  offset: number;
  limit: number;
};

export function parseModelsPageRequest(
  searchParams: URLSearchParams,
): ModelsPageRequest {
  const sort: ModelsSort =
    searchParams.get("sort") === "views" ? "views" : "followers";
  const rawOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(rawOffset)
    ? Math.min(1_000_000, Math.max(0, rawOffset))
    : 0;

  return { sort, offset, limit: MODELS_PAGE_SIZE };
}

export function appendUniqueCreators<T extends { handle: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const seen = new Set(current.map((creator) => creator.handle));
  const merged = [...current];

  for (const creator of incoming) {
    if (seen.has(creator.handle)) continue;
    seen.add(creator.handle);
    merged.push(creator);
  }

  return merged;
}

export type ModelsPagePayload<T> = {
  items: T[];
  hasMore: boolean;
  nextOffset: number | null;
};

export function buildModelsPagePayload<T>(
  rows: readonly T[],
  offset: number,
  limit: number,
): ModelsPagePayload<T> {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);

  return {
    items,
    hasMore,
    nextOffset: hasMore ? offset + items.length : null,
  };
}
