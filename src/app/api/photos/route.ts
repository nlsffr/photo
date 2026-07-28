import { getPhotos } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { anonKey, rateLimit, sweep } from "@/lib/ratelimit";

const SORTS: SortKey[] = ["recent", "trending", "popular", "liked", "random"];

export async function GET(request: Request) {
  sweep();
  const coarse =
    request.headers.get("x-ratelimit-bucket") ?? "shared-anonymous-bucket";
  const { allowed, remaining, resetAt } = rateLimit(anonKey(coarse), 120, 60_000);
  if (!allowed) {
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);

  const sortParam = searchParams.get("sort");
  const sort: SortKey = SORTS.includes(sortParam as SortKey)
    ? (sortParam as SortKey)
    : "recent";

  const typeParam = searchParams.get("type");
  const type: MediaType | undefined =
    typeParam === "photo" || typeParam === "video" || typeParam === "pack"
      ? typeParam
      : undefined;

  const aiParam = searchParams.get("ai");
  const isAi =
    aiParam === "1" ? true : aiParam === "0" ? false : undefined;

  const seedParam = searchParams.get("seed");
  const seed = seedParam !== null && seedParam !== "" ? Number(seedParam) : undefined;

  const page = await getPhotos({
    sort,
    type,
    isAi,
    tag: searchParams.get("tag") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    creator: searchParams.get("creator") ?? undefined,
    cursor: Number(searchParams.get("cursor")) || 0,
    limit: Number(searchParams.get("limit")) || undefined,
    seed: Number.isFinite(seed) ? seed : undefined,
  });

  return Response.json(page, {
    headers: {
      "X-RateLimit-Remaining": String(remaining),
      "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
    },
  });
}
