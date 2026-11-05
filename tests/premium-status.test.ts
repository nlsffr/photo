import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Options = { poolMissing?: boolean; dbError?: boolean; row?: Record<string, unknown> | null; periodEnd?: string | null };
function entitlement(options: Options = {}) {
  const queries: string[] = [];
  const pool = { execute: async (sql: string) => {
    queries.push(sql);
    if (options.dbError) throw new Error("private database connection detail");
    if (!sql.startsWith("SELECT")) assert.fail("a status read must never modify the subscription");
    return [options.row === null ? [] : [{ ...(options.row ?? { is_premium: 0 }), period_end: options.periodEnd }]];
  } };
  return {
    ...loadAppModule<{ isUserPremium: (id: string) => Promise<boolean> }>("src/lib/premium-db.ts", {
      "server-only": {}, "./db-pool": { getDbPool: () => options.poolMissing ? null : pool },
    }),
    queries,
  };
}

test("missing Premium storage and failed DB reads remain unavailable rather than non-Premium", async () => {
  for (const options of [{ poolMissing: true }, { dbError: true }]) {
    await assert.rejects(entitlement(options).isUserPremium("member"), /premium_status_unavailable/);
  }
});

test("only a valid active flag and a future active subscription grant Premium", async () => {
  const active = entitlement({ row: { is_premium: 1 }, periodEnd: "2999-01-01T00:00:00.000Z" });
  assert.equal(await active.isUserPremium("member"), true);
  assert.equal(active.queries.length, 1);
  assert.ok(active.queries.every(sql => sql.startsWith("SELECT")));
  for (const row of [null, { is_premium: 0 }]) {
    const inactive = entitlement({ row }); assert.equal(await inactive.isUserPremium("member"), false);
    assert.equal(inactive.queries.length, 1);
  }
});

test("malformed database flags cannot accidentally grant Premium or revoke an uncertain entitlement", async () => {
  for (const flag of ["0", "1", 2, null, undefined]) {
    const value = entitlement({ row: { is_premium: flag }, periodEnd: "2999-01-01T00:00:00.000Z" });
    await assert.rejects(value.isUserPremium("member"), /premium_status_unavailable/);
    assert.equal(value.queries.length, 1);
  }
});

test("expired and missing subscriptions grant no entitlement and leave storage untouched", async () => {
  for (const periodEnd of ["2000-01-01T00:00:00.000Z", null, undefined]) {
    const expired = entitlement({ row: { is_premium: 1 }, periodEnd });
    assert.equal(await expired.isUserPremium("member"), false);
    assert.equal(expired.queries.length, 1);
    assert.match(expired.queries[0], /^SELECT/);
  }
});

function route(options: Options & { token?: boolean; userMissing?: boolean; sessionError?: boolean } = {}) {
  const db = entitlement(options);
  return loadAppModule<{ GET: () => Promise<Response> }>("src/app/api/premium/status/route.ts", {
    "next/headers": { cookies: async () => ({ get: () => options.token === false ? undefined : { value: "test-session" } }) },
    "@/lib/auth-db": { getSessionUser: async () => {
      if (options.sessionError) throw new Error("private session error");
      return options.userMissing ? null : { id: "member", email: "member@example.test" };
    } },
    "@/lib/premium-db": { isUserPremium: db.isUserPremium },
  });
}

test("the Premium API reports unavailable reads as sanitized uncached 503 responses", async () => {
  for (const options of [{ poolMissing: true }, { dbError: true }, { sessionError: true }]) {
    const response = await route(options).GET();
    assert.equal(response.status, 503);
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    assert.deepEqual(await response.json(), { error: "unavailable" });
  }
});

test("the Premium API still returns confirmed active and inactive results without caching", async () => {
  for (const isPremium of [false, true]) {
    const response = await route({ row: { is_premium: Number(isPremium) }, periodEnd: "2999-01-01T00:00:00.000Z" }).GET();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
    assert.deepEqual(await response.json(), { isPremium, user: { id: "member", email: "member@example.test" } });
  }
});

test("anonymous and absent sessions cannot receive a false-positive Premium flag", async () => {
  for (const options of [{ token: false }, { userMissing: true }]) {
    const response = await route(options).GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { isPremium: false, user: null });
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  }
});

test("reading an expired subscription cannot undo a renewal committed during the status read", async () => {
  let isPremium = 1;
  let periodEnd = "2000-01-01T00:00:00.000Z";
  const renewalEnd = "2999-01-01T00:00:00.000Z";
  const pool = { execute: async (sql: string) => {
    if (sql.startsWith("SELECT") && sql.includes("AS period_end")) {
      const snapshot = { is_premium: isPremium, period_end: periodEnd };
      periodEnd = renewalEnd;
      return [[snapshot]];
    }
    if (sql.startsWith("SELECT is_premium")) return [[{ is_premium: isPremium }]];
    if (sql.startsWith("SELECT current_period_end")) {
      const oldPeriod = periodEnd;
      periodEnd = renewalEnd;
      return [[{ current_period_end: oldPeriod }]];
    }
    if (sql.startsWith("UPDATE users")) isPremium = 0;
    return [{ affectedRows: 1 }];
  } };
  const { isUserPremium } = loadAppModule<{ isUserPremium: (id: string) => Promise<boolean> }>("src/lib/premium-db.ts", {
    "server-only": {}, "./db-pool": { getDbPool: () => pool },
  });

  assert.equal(await isUserPremium("member"), false, "the first snapshot was expired");
  assert.equal(isPremium, 1, "the read must leave the concurrently renewed account enabled");
  assert.equal(await isUserPremium("member"), true, "the next read sees the renewed entitlement");
});
