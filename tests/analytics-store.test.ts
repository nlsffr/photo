import assert from "node:assert/strict";
import test from "node:test";

type Call = { type: string; sql?: string; params?: unknown };

function fakePool(calls: Call[], failOnExecute = false) {
  const connection = {
    async beginTransaction() {
      calls.push({ type: "begin" });
    },
    async execute(sql: string, params?: unknown) {
      calls.push({ type: "execute", sql, params });
      if (failOnExecute) throw new Error("db_down");
      return [[], []];
    },
    async commit() {
      calls.push({ type: "commit" });
    },
    async rollback() {
      calls.push({ type: "rollback" });
    },
    release() {
      calls.push({ type: "release" });
    },
  };
  return {
    async getConnection() {
      calls.push({ type: "connect" });
      return connection;
    },
  };
}

test("records a page view and presence in one transaction", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const store = await import("../src/lib/analytics-store.ts");
  const calls: Call[] = [];

  await store.recordAnalyticsEventWithPool(
    fakePool(calls),
    {
      visitorHash: "a".repeat(64),
      kind: "page_view",
      path: "/models",
      referrerHost: "google.com",
      source: "search",
    },
    new Date("2026-10-29T12:34:56.000Z"),
  );

  assert.deepEqual(
    calls.map((call) => call.type),
    ["connect", "begin", "execute", "execute", "commit", "release"],
  );
  const statements = calls.filter((call) => call.type === "execute");
  assert.match(statements[0]?.sql ?? "", /analytics_daily_visitors/);
  assert.match(statements[1]?.sql ?? "", /analytics_presence/);
  assert.deepEqual((statements[0]?.params as unknown[])?.slice(0, 3), [
    "2026-10-29",
    "a".repeat(64),
    1,
  ]);
});

test("a heartbeat refreshes presence without inflating page views", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const store = await import("../src/lib/analytics-store.ts");
  const calls: Call[] = [];

  await store.recordAnalyticsEventWithPool(
    fakePool(calls),
    {
      visitorHash: "b".repeat(64),
      kind: "heartbeat",
      path: "/",
      referrerHost: null,
      source: null,
    },
    new Date("2026-10-29T00:00:00.000Z"),
  );

  const statements = calls.filter((call) => call.type === "execute");
  assert.equal(statements.length, 1);
  assert.match(statements[0]?.sql ?? "", /analytics_presence/);
});

test("rolls back and releases the connection when a write fails", async () => {
  // @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
  const store = await import("../src/lib/analytics-store.ts");
  const calls: Call[] = [];

  await assert.rejects(() =>
    store.recordAnalyticsEventWithPool(
      fakePool(calls, true),
      {
        visitorHash: "c".repeat(64),
        kind: "page_view",
        path: "/",
        referrerHost: null,
        source: null,
      },
      new Date("2026-10-29T00:00:00.000Z"),
    ),
  );
  assert.deepEqual(
    calls.map((call) => call.type),
    ["connect", "begin", "execute", "rollback", "release"],
  );
});

