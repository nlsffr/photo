import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { buildInvoicePayload, buildTelegramDeepLink, createLaunchToken, hashLaunchToken, isLaunchExpired, parseInvoicePayload, parseStartToken, validatePreCheckout } from "../src/lib/telegram-payment-policy.ts";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { getPlan, isPlanId } from "../src/lib/premium-plans.ts";

test("rejects unknown premium plans instead of silently selling the weekly plan", () => {
  assert.equal(isPlanId("month"), true);
  assert.equal(isPlanId("lifetime"), false);
  assert.throws(() => getPlan("lifetime"), /unknown_plan/);
});

test("creates an opaque launch token and persists only its stable SHA-256 hash", () => {
  const first = createLaunchToken();
  const second = createLaunchToken();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(hashLaunchToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashLaunchToken(first), hashLaunchToken(first));
  assert.notEqual(hashLaunchToken(first), hashLaunchToken(second));
});

test("accepts only the exact Telegram start token shape", () => {
  const token = "A".repeat(43);
  assert.equal(parseStartToken(`/start p_${token}`), token);
  assert.equal(parseStartToken(`/start@LeakFanHubBot p_${token}`), token);
  assert.equal(parseStartToken(`/start premium_week_user`), null);
  assert.equal(parseStartToken(`/start p_${token} extra`), null);
  assert.equal(parseStartToken("/terms"), null);
});

test("builds a bounded invoice payload and parses it without accepting aliases", () => {
  const orderId = "0fda1f7e-38d5-4e2a-b33f-f9e7e668715e";
  const payload = buildInvoicePayload(orderId);

  assert.equal(payload, "lfh:0fda1f7e-38d5-4e2a-b33f-f9e7e668715e");
  assert.equal(parseInvoicePayload(payload), orderId);
  assert.equal(parseInvoicePayload(`premium:${orderId}`), null);
  assert.equal(parseInvoicePayload("lfh:not-a-uuid"), null);
});

test("uses an opaque start parameter in the Telegram deep link", () => {
  const token = "A".repeat(43);
  assert.equal(
    buildTelegramDeepLink("LeakFanHubBot", token),
    `https://t.me/LeakFanHubBot?start=p_${token}`,
  );
  assert.throws(() => buildTelegramDeepLink("bad bot!", token), /invalid_bot_username/);
});

test("treats an order as expired at the exact expiry instant", () => {
  const expires = new Date("2026-10-29T12:30:00.000Z");
  assert.equal(isLaunchExpired(expires, new Date("2026-10-29T12:29:59.999Z")), false);
  assert.equal(isLaunchExpired(expires, new Date("2026-10-29T12:30:00.000Z")), true);
});

test("approves pre-checkout only for the bound user, exact XTR amount and open order", () => {
  const base = {
    orderStatus: "invoice_sent",
    expiresAt: new Date("2026-10-29T12:30:00.000Z"),
    now: new Date("2026-10-29T12:00:00.000Z"),
    orderTelegramUserId: "9988776655",
    queryTelegramUserId: "9988776655",
    orderCurrency: "XTR",
    queryCurrency: "XTR",
    orderAmount: 550,
    queryAmount: 550,
    expectedPayload: "lfh:0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
    queryPayload: "lfh:0fda1f7e-38d5-4e2a-b33f-f9e7e668715e",
  } as const;

  assert.deepEqual(validatePreCheckout(base), { ok: true });
  assert.deepEqual(validatePreCheckout({ ...base, orderStatus: "claimed" }), { ok: true });
  assert.deepEqual(
    validatePreCheckout({ ...base, queryTelegramUserId: "1" }),
    { ok: false, code: "telegram_user_mismatch" },
  );
  assert.deepEqual(
    validatePreCheckout({ ...base, queryAmount: 549 }),
    { ok: false, code: "amount_mismatch" },
  );
  assert.deepEqual(
    validatePreCheckout({ ...base, queryCurrency: "USD" }),
    { ok: false, code: "currency_mismatch" },
  );
  assert.deepEqual(
    validatePreCheckout({ ...base, orderStatus: "paid" }),
    { ok: false, code: "order_not_payable" },
  );
});
