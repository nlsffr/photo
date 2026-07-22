import { getPhotos } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";

const SORTS: SortKey[] = ["recent", "trending", "popular", "liked", "random"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const sortParam = searchParams.get("sort");
  const sort: SortKey = SORTS.includes(sortParam as SortKey)
    ? (sortParam as SortKey)
    : "recent";

  const typeParam = searchParams.get("type");
  const type: MediaType | undefined =
    typeParam === "photo" || typeParam === "video" ? typeParam : undefined;

  const page = getPhotos({
    sort,
    type,
    tag: searchParams.get("tag") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    creator: searchParams.get("creator") ?? undefined,
    cursor: Number(searchParams.get("cursor")) || 0,
    limit: Number(searchParams.get("limit")) || undefined,
  });

  return Response.json(page);
}
