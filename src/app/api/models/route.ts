import { getModels } from "@/lib/photos";
import {
  buildModelsPagePayload,
  parseModelsPageRequest,
} from "@/lib/models-pagination";
import {
  anonKey,
  rateLimit,
  requestRateLimitKey,
  sweep,
} from "@/lib/ratelimit";

export async function GET(request: Request) {
  sweep();
  const { allowed, remaining, resetAt } = rateLimit(
    anonKey(`models:${requestRateLimitKey(request)}`),
    120,
    60_000,
  );
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
  const { sort, offset, limit } = parseModelsPageRequest(searchParams);
  const rows = await getModels(sort, limit + 1, offset);

  return Response.json(buildModelsPagePayload(rows, offset, limit), {
    headers: {
      "Cache-Control": "public, max-age=10, s-maxage=30, stale-while-revalidate=60",
      "X-RateLimit-Remaining": String(remaining),
    },
  });
}
