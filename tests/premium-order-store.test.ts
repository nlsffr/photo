import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { createTelegramPremiumOrder, getTelegramPremiumOrder } from "../src/lib/telegram-order-store.ts";

function fakePool(selectRows: unknown[] = []) {
  const calls: Array<{ sql: string; params?: unknown }> = [];
  const connection = {
    async beginTransaction() {
      calls.push({ sql: "BEGIN" });
    },
    async execute(sql: string, params?: unknown) {
      calls.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return [selectRows, []];
      return [{ affectedRows: 1 }, []];
    },
    async commit() {
      calls.push({ sql: "COMMIT" });
    },
    async rollback() {
      calls.push({ sql: "ROLLBACK" });
    },
    release() {
      calls.push({ sql: "RELEASE" });
    },
  };
  return {
    calls,
    pool: {
      async getConnection() {
        return connection;
      },
      async execute(sql: string, params?: unknown) {
        calls.push({ sql, params });
        return [selectRows, []];
      },
    },
  };
}

test("creates a Stars order transactionally without persisting the raw launch token", async () => {
  const db = fakePool();
  const now = new Date("2026-10-29T12:00:00.000Z");
  const order = await createTelegramPremiumOrder(
    db.pool,
    { userId: "user-1", planId: "week", botUsername: "LeakFanHubBot" },
    {
      now: () => now,
      randomId: () => "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
      launchToken: () => "A".repeat(43),
    },
  );

  assert.deepEqual(order, {
    id: "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
    planId: "week",
    starsAmount: 550,
    status: "pending",
    expiresAt: "2026-10-29T12:30:00.000Z",
    telegramUrl: `https://t.me/LeakFanHubBot?start=p_${"A".repeat(43)}`,
  });
  assert.deepEqual(
    db.calls.map((call) => call.sql === "BEGIN" || call.sql === "COMMIT" || call.sql === "RELEASE" ? call.sql : "SQL"),
    ["BEGIN", "SQL", "COMMIT", "RELEASE"],
  );
  const serializedParams = JSON.stringify(db.calls.find((call) => call.params)?.params);
  assert.equal(serializedParams.includes("A".repeat(43)), false);
  assert.equal(serializedParams.includes("premium_week_user"), false);
  assert.match(serializedParams, /[a-f0-9]{64}/);
  assert.match(db.calls[1].sql, /stars_amount/);
  assert.match(db.calls[1].sql, /telegram_stars/);
});

test("rolls back and releases the connection when order persistence fails", async () => {
  const db = fakePool();
  db.pool.getConnection = async () => ({
    async beginTransaction() {
      db.calls.push({ sql: "BEGIN" });
    },
    async execute() {
      throw new Error("db_down");
    },
    async commit() {},
    async rollback() {
      db.calls.push({ sql: "ROLLBACK" });
    },
    release() {
      db.calls.push({ sql: "RELEASE" });
    },
  });

  await assert.rejects(
    createTelegramPremiumOrder(db.pool, {
      userId: "user-1",
      planId: "week",
      botUsername: "LeakFanHubBot",
    }),
    /db_down/,
  );
  assert.deepEqual(db.calls.map((call) => call.sql), ["BEGIN", "ROLLBACK", "RELEASE"]);
});

test("returns only the authenticated owner's public order state", async () => {
  const db = fakePool([
    {
      id: "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
      plan: "month",
      stars_amount: 1000,
      status: "paid",
      launch_expires_at: new Date("2026-10-29T12:30:00.000Z"),
      paid_at: new Date("2026-10-29T12:12:00.000Z"),
      failure_code: null,
    },
  ]);

  const order = await getTelegramPremiumOrder(
    db.pool,
    "user-1",
    "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
    new Date("2026-10-29T12:15:00.000Z"),
  );

  assert.deepEqual(order, {
    id: "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
    planId: "month",
    starsAmount: 1000,
    status: "paid",
    expiresAt: "2026-10-29T12:30:00.000Z",
    paidAt: "2026-10-29T12:12:00.000Z",
    failureCode: null,
  });
  assert.match(db.calls[0].sql, /user_id = \?/);
  assert.deepEqual(db.calls[0].params, [
    "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
    "user-1",
  ]);
});

test("exposes an expired state without leaking internal payment identifiers", async () => {
  const db = fakePool([
    {
      id: "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
      plan: "week",
      stars_amount: 550,
      status: "invoice_sent",
      launch_expires_at: new Date("2026-10-29T12:30:00.000Z"),
      paid_at: null,
      failure_code: null,
      telegram_payment_charge_id: "secret-charge",
      telegram_user_id: "9988776655",
    },
  ]);

  const order = await getTelegramPremiumOrder(
    db.pool,
    "user-1",
    "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
    new Date("2026-10-29T12:30:00.000Z"),
  );
  assert.equal(order?.status, "expired");
  assert.equal("telegramUserId" in (order ?? {}), false);
  assert.equal("telegramPaymentChargeId" in (order ?? {}), false);
});
