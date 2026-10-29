import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { parseOrderStatus, shouldPollOrder } from "../src/lib/premium-order-ui.ts";

test("keeps polling only while a Telegram order can still become paid", () => {
  assert.equal(shouldPollOrder("pending"), true);
  assert.equal(shouldPollOrder("claimed"), true);
  assert.equal(shouldPollOrder("invoice_sent"), true);
  assert.equal(shouldPollOrder("paid"), false);
  assert.equal(shouldPollOrder("expired"), false);
  assert.equal(shouldPollOrder("failed"), false);
  assert.equal(shouldPollOrder("refunded"), false);
});

test("rejects unknown server statuses instead of displaying a false success", () => {
  assert.equal(parseOrderStatus("paid"), "paid");
  assert.equal(parseOrderStatus("unexpected"), "failed");
  assert.equal(parseOrderStatus(null), "failed");
});
