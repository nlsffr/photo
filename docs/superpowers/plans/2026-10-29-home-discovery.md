# Source Engagement and Homepage Option B Plan

> **Spec:** `docs/superpowers/specs/2026-10-29-growth-platform.md`

**Goal:** Produce a fast, changing, source-popularity-led homepage with creator diversity and usable filters.

**Architecture:** First split source and local metrics. Then query a bounded indexed union of popular, liked, and recent candidates. A pure deterministic ranker applies source score, freshness, exploration, and diversity. A stable seed is carried through pagination. Common filters stay visible and the long tail moves into an accessible drawer.

### Task 1: Separate source and local engagement

**Files:**
- Create: `migrations/015-source-engagement.sql`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/providers/mariadb.ts`
- Modify: `src/app/api/photos/view/route.ts`
- Modify: production MegaBot ingestion without changing its credentials
- Test: `tests/source-engagement.test.ts`

1. Write failing tests proving local views cannot modify source metrics and migration fallbacks preserve current ranking data.
2. Add `source_views_count`, `source_likes_count`, and `local_views_count`, with ordered indexes for source views/likes.
3. Backfill source columns from existing values once, then change local view recording to increment only `local_views_count` and `media_views`.
4. Update MegaBot upserts to write source columns only. Do not edit or move its hard-coded credentials.
5. Run the focused tests and an ingestion dry run against a disposable row.

### Task 2: Define the pure ranker

**Files:**
- Create: `src/lib/home-feed.ts`
- Test: `tests/home-feed.test.ts`

1. Write failing tests: source views/likes dominate, stale media decays, different seeds vary ties, the same seed is stable, no creator exceeds two of the first 24 when alternatives exist, media types diversify, and already-seen IDs never repeat.
2. Implement named, tunable score constants: 70–80% source, 15–20% freshness, 5–10% exploration, capped local boost.
3. Confirm the tests pass.

### Task 3: Add a bounded indexed candidate plan

**Files:**
- Modify: `src/lib/providers/photo-query-plan.ts`
- Modify: `src/lib/providers/mariadb.ts`
- Modify: `src/lib/providers/demo.ts`
- Modify: `tests/mariadb-query-plan.test.ts`

1. Add failing plan tests for a bounded union of the top 400 source views, top 400 source likes, and 400 recent media.
2. Preserve active-content, tag, creator, and type predicates.
3. Do not use `RAND()`, a full-table computed sort, or moving unbounded candidates.
4. Validate the production `EXPLAIN` shape and latency.

### Task 4: Stable pagination

**Files:**
- Modify: `src/lib/photos.ts`
- Modify: `src/app/api/photos/route.ts`
- Modify: `src/components/InfiniteGallery.tsx`
- Test: `tests/home-pagination.test.ts`

1. Test seed creation/normalization, duplicate exclusion, next-cursor stability, and append behavior.
2. Return the server seed with every page and preserve it in load-more requests.
3. Ensure “Charger plus” appends in place rather than navigating.

### Task 5: Filter UX

**Files:**
- Create: `src/lib/home-filter-links.ts`
- Create: `src/components/HomeFilters.tsx`
- Modify: `src/components/TagChips.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/home-filter-links.test.ts`

1. Test preservation of sort/type/tag and clear-all behavior.
2. Show discovery, trends, recent, photos, and videos in a compact row on mobile and desktop.
3. Show 8–12 priority tags plus an accessible searchable “Tous les filtres” drawer.
4. Give clear active-filter feedback and keep state in the URL.

### Task 6: Verify and commit

1. Run focused feed, pagination, filter, and query-plan tests.
2. Run `node --experimental-strip-types --test tests/*.test.ts` and `npm run build`.
3. Browser-test desktop/mobile navigation, filter state, and load more.
4. Compare production SQL latency and repeated homepage IDs.
5. Commit: `feat: diversify source-led homepage discovery`.

