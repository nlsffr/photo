import assert from "node:assert/strict";
import test from "node:test";

async function loadEntitlementPolicy() {
  try {
    // @ts-expect-error Native type stripping needs the explicit suffix.
    return await import("../src/lib/premium-entitlement.ts");
  } catch (error) {
    assert.fail(`premium entitlement policy is unavailable: ${String(error)}`);
  }
}

test("a legacy premium flag without an active subscription grants no access", async () => {
  const { premiumEntitlementState } = await loadEntitlementPolicy();

  assert.equal(
    premiumEntitlementState({ isPremium: true, periodEnd: null }, Date.parse("2026-10-29T12:00:00Z")),
    "missing",
  );
});

test("only a future subscription period is active", async () => {
  const { premiumEntitlementState } = await loadEntitlementPolicy();
  const now = Date.parse("2026-10-29T12:00:00Z");

  assert.equal(
    premiumEntitlementState({ isPremium: true, periodEnd: "2026-10-30T12:00:00Z" }, now),
    "active",
  );
  assert.equal(
    premiumEntitlementState({ isPremium: true, periodEnd: "2026-10-29T12:00:00Z" }, now),
    "expired",
  );
  assert.equal(
    premiumEntitlementState({ isPremium: false, periodEnd: "2026-10-30T12:00:00Z" }, now),
    "missing",
  );
});
