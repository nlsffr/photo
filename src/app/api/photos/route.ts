import { getPhotos } from "@/lib/photos";
import type { MediaType, SortKey } from "@/lib/types";
import { anonKey, rateLimit, sweep } from "@/lib/ratelimit";
import { cacheGet, cacheSet, cacheKey } from "@/lib/cache";

const SORTS: SortKey[] = [
  "recent",
  "trending",
  "popular",
  "liked",
  "random",
  "longest",
];

/** Cache only first pages of common feeds (high traffic). */
const CACHE_TTL_MS = 20_000;

function clientKey(request: Request): string {
  const explicit = request.headers.get("x-ratelimit-bucket");
  if (explicit) return explicit;
  const fwd =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "";
  if (fwd) return fwd;
  return `ua:${request.headers.get("user-agent")?.slice(0, 80) ?? "unknown"}`;
}

export async function GET(request: Request) {
  sweep();
  const coarse = clientKey(request);
  const { allowed, remaining, resetAt } = rateLimit(anonKey(coarse), 300, 60_000);
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

  const cursor = Number(searchParams.get("cursor")) || 0;
  const limit = Number(searchParams.get("limit")) || undefined;
  const tag = searchParams.get("tag") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const creator = searchParams.get("creator") ?? undefined;

  // Cache only simple list queries (no search), first pages
  const canCache =
    !q &&
    !tag &&
    !creator &&
    sort !== "random" &&
    cursor < 3;

  const key = canCache
    ? cacheKey({ sort, type, isAi, cursor, limit, seed: undefined })
    : null;

  if (key) {
    const hit = cacheGet<unknown>(key);
    if (hit) {
      return Response.json(hit, {
        headers: {
          "X-RateLimit-Remaining": String(remaining),
          "X-Cache": "HIT",
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
        },
      });
    }
  }

  const page = await getPhotos({
    sort,
    type,
    isAi,
    tag,
    q,
    creator,
    cursor,
    limit,
    seed: Number.isFinite(seed) ? seed : undefined,
  });

  if (key) cacheSet(key, page, CACHE_TTL_MS);

  return Response.json(page, {
    headers: {
      "X-RateLimit-Remaining": String(remaining),
      "X-Cache": key ? "MISS" : "BYPASS",
      "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
    },
  });
}
