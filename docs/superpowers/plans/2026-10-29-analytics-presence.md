# Analytics and Presence Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-10-29-growth-platform.md`

**Goal:** Add trustworthy daily visitor/page-view metrics and a five-minute presence count without confusing them with login sessions.

**Architecture:** A client component sends initial/navigation views and 60-second visible-document heartbeats to a rate-limited route. MariaDB stores daily aggregates and short-lived presence keyed by a random first-party visitor hash. An operator script reports metrics; the public API exposes no dashboard data.

### Task 1: Pure analytics policy

**Files:**
- Create: `src/lib/analytics-policy.ts`
- Test: `tests/analytics-policy.test.ts`

1. Write failing tests for accepted event kinds, safe path normalization, bot rejection, visitor token validation/hash, and five-minute cutoff.
2. Implement the minimal pure helpers.
3. Run `node --experimental-strip-types --test tests/analytics-policy.test.ts` green.

### Task 2: Add aggregate and presence tables

**Files:**
- Create: `migrations/016-analytics-presence.sql`
- Modify: `docs/DATABASE.md`

1. Add `analytics_daily_visitors` with `(day, visitor_hash)` primary key, view count, first/last seen, and bounded source/referrer fields.
2. Add `analytics_presence` with visitor hash primary key and indexed `last_seen_at`.
3. Persist no raw IP.
4. Apply to a disposable schema and prove a repeat upsert increments views without duplicating a visitor.

### Task 3: Transactional ingestion

**Files:**
- Create: `src/lib/analytics-db.ts`
- Create: `src/app/api/analytics/route.ts`
- Test: `tests/analytics-route-policy.test.ts`

1. Test page-view/heartbeat payloads, invalid cookie, asset/API path exclusion, bots, and oversized referrers.
2. Implement cookie issuance, server-side hashing, coarse rate limiting, daily upsert, and presence upsert.
3. Prune stale presence probabilistically without a scan on every request.
4. Return `204` and no sensitive data.

### Task 4: Client navigation instrumentation

**Files:**
- Create: `src/components/AnalyticsBeacon.tsx`
- Modify: `src/app/layout.tsx`

1. Add a testable event builder and guard against duplicate initial events.
2. Mount one client boundary using `sendBeacon` with keepalive fetch fallback.
3. Record initial page, App Router navigation, and one heartbeat per minute while visible.

### Task 5: Operator reporting

**Files:**
- Create: `scripts/analytics-report.mjs`
- Modify: `docs/DEPLOY.md`

1. Report accounts, unexpired sessions, daily unique visitors, page views, and five-minute presence as separate labels.
2. Preserve the one-off nginx-log baseline and its bot/static filtering caveats.
3. Compare today/yesterday after deployment.

### Task 6: Verify and commit

1. Run focused analytics tests, all Node tests, and `npm run build`.
2. Lint changed analytics files only and add no baseline violation.
3. Deploy migration and app, then verify a page view and heartbeat aggregate.
4. Commit: `feat: add first-party traffic and presence analytics`.

