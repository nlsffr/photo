import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const LEGACY_ROUTES = [
  "../src/app/api/premium/activate/route.ts",
  "../src/app/api/premium/crypto-order/route.ts",
  "../src/app/api/stripe/checkout/route.ts",
  "../src/app/api/stripe/webhook/route.ts",
];

test("legacy premium payment and activation routes are explicitly gone", async () => {
  for (const relative of LEGACY_ROUTES) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /legacyPremiumGone/);
    assert.doesNotMatch(source, /PREMIUM_ADMIN_SECRET|STRIPE_SECRET_KEY|createPremiumOrder|activatePremium/);
  }
  const helper = await readFile(
    new URL("../src/lib/legacy-premium-route.ts", import.meta.url),
    "utf8",
  );
  assert.match(helper, /status:\s*410/);
  assert.match(helper, /Cache-Control.*no-store/);
});

test("the premium UI advertises only benefits that are currently implemented", async () => {
  const source = await readFile(
    new URL("../src/app/premium/page.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /Qualité et vitesse prioritaires/);
});

test("the payment ledger stores the entitlement interval needed for safe refunds", async () => {
  const migration = await readFile(
    new URL("../migrations/017-telegram-stars-outbox.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /entitlement_start/);
  assert.match(migration, /entitlement_end/);
  assert.match(migration, /telegram_failed_updates/);
});

test("host workers override only the Docker database hostname", async () => {
  for (const relative of [
    "../infra/systemd/leakfanhub-telegram-premium.service",
    "../infra/systemd/leakfanhub-notification-worker.service",
  ]) {
    const unit = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.match(unit, /TELEGRAM_WORKER_DATABASE_HOST=127\.0\.0\.1/);
    assert.doesNotMatch(unit, /TELEGRAM_WORKER_DATABASE_URL/);
  }
  const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  assert.doesNotMatch(example, /TELEGRAM_WORKER_DATABASE_URL/);
});
