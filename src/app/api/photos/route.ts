import { getPhotos } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { anonKey, rateLimit, sweep } from "@/lib/ratelimit";

const SORTS: SortKey[] = ["recent", "trending", "popular", "liked", "random"];

export async function GET(request: Request) {
  // Rate limit on a coarse, immediately-anonymised key. We never read or store
  // a raw IP: we hash whatever the edge passed (or a constant fallback) with an
  // ephemeral per-process salt. No identifiable data is retained.
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

  const page = await getPhotos({
    sort,
    type,
    tag: searchParams.get("tag") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    creator: searchParams.get("creator") ?? undefined,
    cursor: Number(searchParams.get("cursor")) || 0,
    limit: Number(searchParams.get("limit")) || undefined,
  });

  return Response.json(page, {
    headers: { "X-RateLimit-Remaining": String(remaining) },
  });
}
