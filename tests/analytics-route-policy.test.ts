import assert from "node:assert/strict";
import test from "node:test";

test("bounds attribution data to a host and a short source label", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const policy = await import("../src/lib/analytics-policy.ts");

  assert.equal(
    policy.normalizeAnalyticsReferrerHost(
      "https://Example.COM/private/path?email=user@example.com",
    ),
    "example.com",
  );
  assert.equal(policy.normalizeAnalyticsReferrerHost("javascript:alert(1)"), null);
  assert.equal(
    policy.normalizeAnalyticsSource(" paid<script> / october "),
    "paidscript  october",
  );
  assert.equal(policy.normalizeAnalyticsSource("a".repeat(200))?.length, 64);
});

test("builds client events without copying query strings into the stored path", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const client = await import("../src/lib/analytics-client.ts");

  assert.deepEqual(
    client.buildAnalyticsClientEvent(
      "page_view",
      "/models",
      "page=3&utm_source=telegram",
      "https://t.me/LeakFanHubBot",
    ),
    {
      event: "page_view",
      path: "/models",
      source: "telegram",
      referrer: "https://t.me/LeakFanHubBot",
    },
  );
  assert.deepEqual(
    client.buildAnalyticsClientEvent("heartbeat", "/models", "page=3", ""),
    { event: "heartbeat", path: "/models" },
  );
});

test("deduplicates only the same immediate client navigation", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const client = await import("../src/lib/analytics-client.ts");

  assert.equal(client.shouldSendAnalyticsPageView(null, "/models?page=1", 1000), true);
  assert.equal(
    client.shouldSendAnalyticsPageView(
      { key: "/models?page=1", sentAt: 1000 },
      "/models?page=1",
      2500,
    ),
    false,
  );
  assert.equal(
    client.shouldSendAnalyticsPageView(
      { key: "/models?page=1", sentAt: 1000 },
      "/models?page=1",
      3101,
    ),
    true,
  );
  assert.equal(
    client.shouldSendAnalyticsPageView(
      { key: "/models?page=1", sentAt: 1000 },
      "/models?page=2",
      1100,
    ),
    true,
  );
});

