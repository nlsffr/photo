import { getPhotos } from "@/lib/photos";
import type { SortKey } from "@/lib/types";

const SORTS: SortKey[] = ["recent", "trending", "popular", "liked", "random"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const sortParam = searchParams.get("sort");
  const sort: SortKey = SORTS.includes(sortParam as SortKey)
    ? (sortParam as SortKey)
    : "recent";

  const page = getPhotos({
    sort,
    tag: searchParams.get("tag") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    creator: searchParams.get("creator") ?? undefined,
    cursor: Number(searchParams.get("cursor")) || 0,
    limit: Number(searchParams.get("limit")) || undefined,
  });

  return Response.json(page);
}
