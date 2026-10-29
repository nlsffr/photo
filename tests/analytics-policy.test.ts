import assert from "node:assert/strict";
import test from "node:test";

test("accepts page views and heartbeats while normalizing safe paths", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const policy = await import("../src/lib/analytics-policy.ts");

  assert.deepEqual(
    policy.parseAnalyticsPayload({
      event: "page_view",
      path: "/models?page=2#grid",
      referrer: "https://www.google.com/search?q=private-query",
      source: "newsletter_october",
    }),
    {
      kind: "page_view",
      path: "/models",
      referrerHost: "www.google.com",
      source: "newsletter_october",
    },
  );
  assert.deepEqual(
    policy.parseAnalyticsPayload({ event: "heartbeat", path: "/alice/123" }),
    {
      kind: "heartbeat",
      path: "/alice/123",
      referrerHost: null,
      source: null,
    },
  );
});

test("rejects invalid events, internal routes, assets, and unsafe paths", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const policy = await import("../src/lib/analytics-policy.ts");

  for (const payload of [
    { event: "click", path: "/" },
    { event: "page_view", path: "https://evil.example/" },
    { event: "page_view", path: "//evil.example/" },
    { event: "page_view", path: "/api/auth/me" },
    { event: "page_view", path: "/_next/static/app.js" },
    { event: "page_view", path: "/image.webp" },
    { event: "page_view", path: "/sitemap.xml" },
    { event: "page_view", path: "/hello%0aworld" },
  ]) {
    assert.equal(policy.parseAnalyticsPayload(payload), null);
  }
});

test("recognizes crawler user agents without rejecting normal browsers", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const policy = await import("../src/lib/analytics-policy.ts");

  assert.equal(policy.isAnalyticsBot("Googlebot/2.1"), true);
  assert.equal(policy.isAnalyticsBot("curl/8.5.0"), true);
  assert.equal(
    policy.isAnalyticsBot(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141 Safari/537.36",
    ),
    false,
  );
});

test("creates strict opaque visitor tokens and hashes them with a server secret", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const policy = await import("../src/lib/analytics-policy.ts");

  const token = policy.createAnalyticsVisitorToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(policy.isValidAnalyticsVisitorToken(token), true);
  assert.equal(policy.isValidAnalyticsVisitorToken("visitor-123"), false);

  const first = policy.hashAnalyticsVisitorToken(token, "secret-a-analytics");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(
    first,
    policy.hashAnalyticsVisitorToken(token, "secret-a-analytics"),
  );
  assert.notEqual(
    first,
    policy.hashAnalyticsVisitorToken(token, "secret-b-analytics"),
  );
  assert.equal(first.includes(token), false);
});

test("uses a five minute presence window", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const policy = await import("../src/lib/analytics-policy.ts");

  const now = new Date("2026-10-29T12:00:00.000Z");
  assert.equal(
    policy.analyticsPresenceCutoff(now).toISOString(),
    "2026-10-29T11:55:00.000Z",
  );
});

