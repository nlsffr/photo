import assert from "node:assert/strict";
import test from "node:test";

async function loadPolicy() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/photo-view-policy.ts");
  } catch (error) {
    assert.fail(`photo view policy is unavailable: ${String(error)}`);
  }
}

async function loadRateLimiter() {
  try {
    // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
    return await import("../src/lib/ratelimit.ts");
  } catch (error) {
    assert.fail(`rate limiter is unavailable: ${String(error)}`);
  }
}

test("photo view writes are bounded per client before they can affect ranking", async () => {
  const { checkPhotoViewRateLimit } = await loadPolicy();
  const { rateLimitRequest } = await loadRateLimiter();
  const request = new Request("https://example.test/api/photos/view", {
    headers: {
      "x-forwarded-for": "198.51.100.231",
      "x-real-ip": "192.0.2.231",
      "user-agent": "photo-view-rate-limit-test",
    },
  });

  for (let index = 0; index < 120; index += 1) {
    assert.equal(
      checkPhotoViewRateLimit(request, rateLimitRequest).allowed,
      true,
      `request ${index + 1} should be allowed`,
    );
  }
  const blocked = checkPhotoViewRateLimit(request, rateLimitRequest);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetAt > Date.now());
});
