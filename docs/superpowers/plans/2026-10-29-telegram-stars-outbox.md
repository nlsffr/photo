# Telegram Stars and Durable Notifications Plan

> **Spec:** `docs/superpowers/specs/2026-10-29-growth-platform.md`

**Goal:** Make premium purchasable through Telegram Stars and ensure contact/report notifications are delivered reliably from the host.

**Architecture:** The web app creates pending orders and opaque launch tokens. A Python host worker long-polls the existing bot, sends XTR invoices, validates pre-checkout requests, and processes successful payments transactionally. A separate host worker drains a database outbox so notification latency cannot block Telegram's ten-second pre-checkout deadline.

### Task 1: Payment invariants

**Files:**
- Create: `src/lib/telegram-payment-policy.ts`
- Test: `tests/telegram-payment-policy.test.ts`

1. Write failing tests for strict plan lookup, exact Stars amount, payload parsing, opaque token/hash, expiry, Telegram-user binding, and replay rejection.
2. Implement minimal pure functions; reject unknown plans instead of silently falling back to `week`.

### Task 2: Schema

**Files:**
- Create: `migrations/017-telegram-stars-outbox.sql`
- Modify: `docs/DATABASE.md`

1. Extend `premium_orders` with integer Stars amount, token hash/expiry, Telegram IDs, invoice payload/timestamps, charge ID, paid/refunded timestamps, and failure code.
2. Add `telegram_payments` with unique charge, order, and update IDs.
3. Add `telegram_worker_state` and `notification_outbox` with lease/retry fields.
4. Remove the broken `uq_sub_user_active(user_id,status)` pattern and index `(user_id,status,current_period_end)`.
5. Test duplicate charge/update constraints and repeated historical subscriptions on a disposable DB.

### Task 3: Authenticated order APIs

**Files:**
- Create: `src/app/api/premium/telegram-order/route.ts`
- Create: `src/app/api/premium/orders/[id]/route.ts`
- Modify: `src/lib/premium-db.ts`
- Test: `tests/premium-order-policy.test.ts`

1. Test authentication, plan allowlist, hash-only persistence, expiry, authenticated ownership, and status idempotence.
2. Create a transaction freezing plan and Stars amount.
3. Return only order ID, exact Stars amount, expiry, and deep link.

### Task 4: Premium worker

**Files:**
- Create: `workers/telegram_api.py`
- Create: `workers/telegram_premium_worker.py`
- Create: `workers/test_telegram_premium_worker.py`
- Create: `infra/systemd/leakfanhub-telegram-premium.service`
- Modify: `docs/DEPLOY.md`

1. Mock Telegram/MariaDB and test `/start`, one-line XTR invoice with omitted provider token, valid `start_parameter`, pre-checkout deadline, mismatches, expiry, duplicate update/charge, renewal extension, restart offset, DB failure, `/terms`, `/support`, `/paysupport`, and refund bookkeeping.
2. Implement bounded long polling with persisted offset and structured secret-free logs.
3. Activate in one row-locked transaction; extend from `MAX(NOW(), active_end)`.
4. Install with the existing host environment. Do not change the token.

### Task 5: Premium UI

**Files:**
- Modify: `src/app/premium/page.tsx`
- Modify: `src/lib/premium-plans.ts`
- Modify: `src/components/Premium.tsx`

1. Test price and pending/paid/expired/failed states.
2. Remove fake card/Stripe choices and hide unconfigured crypto choices from the public flow.
3. Create the order before opening Telegram, poll that order, and refresh premium after paid.

### Task 6: Durable contact/report delivery

**Files:**
- Create: `src/lib/notification-outbox.ts`
- Modify: `src/app/api/contact/route.ts`
- Modify: `src/app/api/reports/route.ts`
- Create: `workers/notification_worker.py`
- Create: `workers/test_notification_worker.py`
- Create: `infra/systemd/leakfanhub-notification-worker.service`
- Test: `tests/notification-policy.test.ts`

1. Test atomic store-plus-outbox, truthful response fields, rate limiting, lease handling, retry schedule, and terminal failure.
2. Insert submission and outbox in one transaction.
3. Send from the host worker with bounded exponential retry; only mark delivered after Telegram success.

### Task 7: Verify and commit

1. Run focused Node/Python tests, all Node tests, and `npm run build`.
2. Apply migration, install workers, and verify bot polling plus an order creation without a real payment.
3. Submit a controlled contact test and prove outbox delivery.
4. Commit: `feat: activate premium with Telegram Stars`.

