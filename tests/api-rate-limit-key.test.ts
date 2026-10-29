import assert from "node:assert/strict";
import test from "node:test";

test("derives one coarse request bucket without storing a raw address", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const limiter = await import("../src/lib/ratelimit.ts");
  const requestRateLimitKey = (
    limiter as unknown as {
      requestRateLimitKey?: (request: Request) => string;
    }
  ).requestRateLimitKey;

  assert.equal(typeof requestRateLimitKey, "function");
  assert.equal(
    requestRateLimitKey?.(
      new Request("https://example.test", {
        headers: {
          "x-ratelimit-bucket": "client-controlled-bucket",
          "x-real-ip": "198.51.100.8",
          "x-forwarded-for": "203.0.113.4, 10.0.0.1",
        },
      }),
    ),
    "198.51.100.8",
  );
  assert.equal(
    requestRateLimitKey?.(
      new Request("https://example.test", {
        headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.1" },
      }),
    ),
    "203.0.113.4",
  );
  assert.equal(
    requestRateLimitKey?.(
      new Request("https://example.test", {
        headers: { "user-agent": "test-agent" },
      }),
    ),
    "ua:test-agent",
  );
  assert.equal(
    requestRateLimitKey?.(
      new Request("https://example.test", {
        headers: {
          "x-ratelimit-bucket": "client-controlled-bucket",
          "user-agent": "fallback-agent",
        },
      }),
    ),
    "ua:fallback-agent",
  );
});
