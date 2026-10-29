import type { MediaType, SortKey } from "./types";

export type HomeFilterState = {
  sort?: SortKey | string;
  type?: MediaType | string | null;
  tag?: string | null;
};

export type HomeFilterChange = HomeFilterState & { clearAll?: boolean };

export function buildHomeHref(
  current: HomeFilterState,
  change: HomeFilterChange,
): string {
  if (change.clearAll) return "/";

  const state = { ...current, ...change };
  const params = new URLSearchParams();
  if (state.sort && state.sort !== "discover") params.set("sort", state.sort);
  if (state.type) params.set("type", state.type);
  if (state.tag) params.set("tag", state.tag);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}
