import assert from "node:assert/strict";
import test from "node:test";

test("accepts only the configured same-origin analytics request", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const requestPolicy = await import("../src/lib/analytics-request.ts");

  const requestUrl = "https://leakfanhub.com/api/analytics";
  assert.equal(
    requestPolicy.isAllowedAnalyticsOrigin(
      requestUrl,
      new Headers({
        origin: "https://leakfanhub.com",
        "sec-fetch-site": "same-origin",
      }),
      "https://leakfanhub.com",
    ),
    true,
  );
  assert.equal(
    requestPolicy.isAllowedAnalyticsOrigin(
      requestUrl,
      new Headers({
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      }),
      "https://leakfanhub.com",
    ),
    false,
  );
  assert.equal(
    requestPolicy.isAllowedAnalyticsOrigin(
      requestUrl,
      new Headers({ "sec-fetch-site": "same-origin" }),
      "https://leakfanhub.com",
    ),
    false,
  );
});

test("reads JSON through an actual byte limit even without Content-Length", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const requestPolicy = await import("../src/lib/analytics-request.ts");

  const valid = new Request("https://leakfanhub.com/api/analytics", {
    method: "POST",
    body: JSON.stringify({ event: "heartbeat", path: "/models" }),
  });
  assert.deepEqual(await requestPolicy.readBoundedJson(valid, 128), {
    event: "heartbeat",
    path: "/models",
  });

  const encoder = new TextEncoder();
  const oversized = new Request("https://leakfanhub.com/api/analytics", {
    method: "POST",
    duplex: "half",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"event":"heartbeat","path":"/'));
        controller.enqueue(encoder.encode("x".repeat(256)));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      },
    }),
  } as RequestInit & { duplex: "half" });

  await assert.rejects(
    requestPolicy.readBoundedJson(oversized, 64),
    (error: unknown) =>
      error instanceof Error && error.message === "analytics_payload_too_large",
  );
});

test("distinguishes invalid JSON from an oversized body", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const requestPolicy = await import("../src/lib/analytics-request.ts");

  const invalid = new Request("https://leakfanhub.com/api/analytics", {
    method: "POST",
    body: "not-json",
  });
  await assert.rejects(
    requestPolicy.readBoundedJson(invalid, 128),
    (error: unknown) =>
      error instanceof Error && error.message === "analytics_invalid_json",
  );
});

