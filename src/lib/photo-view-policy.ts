type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type RateLimiter = (
  request: Request,
  options: {
    scope: string;
    limit: number;
    peerLimit: number;
    windowMs: number;
  },
) => RateLimitResult;

const PHOTO_VIEW_RATE_LIMIT = {
  scope: "photo-view",
  limit: 120,
  peerLimit: 2_000,
  windowMs: 60_000,
} as const;

/** Keep first-party view writes bounded even when callers bypass client dedupe. */
export function checkPhotoViewRateLimit(
  request: Request,
  limiter: RateLimiter,
): RateLimitResult {
  return limiter(request, PHOTO_VIEW_RATE_LIMIT);
}
