# Indexable Growth Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the completed creator-collection SEO work on top of production, correct the blockers found in review, and increase the number and quality of genuinely indexable active-content pages.

**Architecture:** Keep the existing stable media canonicals and immutable sitemap partitions. Add crawlable creator-intent pages only when their public media thresholds are met, expose those pages through bounded sitemaps, and replace non-informative media descriptions with factual fallbacks. Roll out additional locales only through genuinely translated discovery and creator pages; do not multiply every media URL or republish removed content.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript, MariaDB/mysql2, Node test runner, Docker Compose, Nginx.

**Spec:** `docs/superpowers/specs/2026-10-29-programmatic-seo.md`

## Global Constraints

- Base every deploy on `origin/main` so production nginx, analytics and sitemap fixes remain present.
- Removed creators and media stay excluded from routes, links, structured data and sitemaps.
- Do not propagate the manually modified VPS DMCA listener or enable Google/IndexNow publishing.
- A sitemap may contain only canonical, public, indexable 200 responses and must stay below 50,000 URLs and 50 MiB.
- Do not create translated media duplicates while their primary content remains identical.
- Only real database titles, creator names and verified aliases may appear in metadata.
- Each production rollout has a known previous image for immediate rollback.

## Review Focus

- Handles containing `_`, `.`, repeated punctuation, or leading/trailing punctuation must remain routable without accepting `/`, encoded separators, `.` or `..` path segments.
- A stored description such as `source:12345` must never become the public meta or JSON-LD description.
- Collection sitemap eligibility must exactly match page eligibility, including removed-content filters.
- Pagination canonicals and hreflang clusters must remain reciprocal for EN, FR and `x-default`.
- The deploy must not overwrite host-only bot/DMCA scripts or change publisher service state.

---

### Task 1: Integrate production and repair creator handle compatibility

**Files:**
- Modify: `src/lib/creator-collections.ts`
- Modify: `src/app/(default)/[handle]/[id]/page.tsx`
- Modify: `tests/creator-collections.test.ts`
- Test: `tests/creator-i18n-routing.test.ts`
- Test: `tests/creator-link-policy.test.ts`

**Interfaces:**
- Consumes: the eight reviewed creator-collection commits cherry-picked on `origin/main`.
- Produces: `parseCreatorCollectionPath()` and `creatorCollectionPath()` accepting the complete production-safe handle alphabet `[A-Za-z0-9._-]` while rejecting separator/path traversal inputs.
- Produces: media pages that use the bounded creator lookup and link to the creator overview without aggregating the creator's full collection stats.

- [ ] Write literal failing cases for underscore, dot, leading/trailing punctuation and encoded separators.
- [ ] Run the focused tests and confirm failure is caused by the restrictive handle validator.
- [ ] Implement the smallest safe validator change and remove the existing unused locale variable.
- [ ] Add a failing media-page query-budget assertion, then replace the collection aggregate with the existing creator lookup and overview backlink.
- [ ] Run collection, localized-route and link tests; commit the compatibility fix.

### Task 2: Replace non-informative media descriptions

**Files:**
- Modify: `src/lib/media-seo.ts`
- Modify: `tests/media-seo.test.ts`

**Interfaces:**
- Produces: `buildMediaSeo()` that treats `source:<identifier>`, bare identifiers and markup-only descriptions as missing, then emits a bounded factual description from media kind, real title, creator and public ID.

- [ ] Add failing tests proving `source:98123` never appears in metadata or structured data.
- [ ] Run the focused test and observe the literal bad description.
- [ ] Add the minimal non-informative-description detector and factual fallback.
- [ ] Run media SEO tests and commit.

### Task 3: Publish eligible creator collections in bounded sitemaps

**Files:**
- Modify: `src/lib/sitemap-data.ts`
- Create or modify: `src/lib/creator-sitemap.ts`
- Modify: `src/app/sitemaps/profiles/route.ts`
- Modify: `tests/sitemap-xml.test.ts`
- Modify: `tests/sitemap-query.test.ts`

**Interfaces:**
- Produces: a bounded query returning active creator URL version, public counts and update time.
- Produces: sitemap entries for overview plus eligible photos/videos/popular pages, with EN/FR/x-default alternates and the same thresholds used by routes.

- [ ] Add failing query and XML tests for thresholds, alternates, removals and the 50,000 URL cap.
- [ ] Run focused tests and confirm the new collection entries are absent.
- [ ] Implement one bounded aggregate query and XML mapping without per-creator queries.
- [ ] Run sitemap and removed-content tests; commit.

### Task 4: Verify and deploy the first growth release

**Files:**
- Update: this plan ledger only; no production source changes.

**Interfaces:**
- Produces: a GitHub `main` commit and a versioned Docker image with a verified rollback target.

- [ ] Run all Node tests, TypeScript, ESLint and the production build.
- [ ] Run a fresh whole-branch code review and fix every Critical/Important finding with RED-GREEN tests.
- [ ] Push the reviewed branch, merge fast-forward/merge commit into GitHub `main`, and build a versioned image on the VPS.
- [ ] Deploy only app/edge configuration, leaving host bot and DMCA scripts untouched.
- [ ] Smoke-test health, homepage, EN/FR creator sections, weak/eligible collections, media metadata, robots and sitemaps; roll back on regression.

### Task 5: Prepare the next international rollout without thin duplicates

**Files:**
- Modify in a subsequent reviewed release: locale registry, translated dictionaries, explicit locale wrappers, metadata and sitemap tests.

**Interfaces:**
- Produces first-class ES, DE, IT, PT and NL discovery/creator pages; later locale additions reuse the same registry.

- [ ] Introduce a single locale registry and remove hard-coded EN/FR route parsing.
- [ ] Add complete translated SEO copy for the high-value discovery and creator routes before making each locale indexable.
- [ ] Add reciprocal hreflang/sitemap tests and HTTP smoke tests for each locale.
- [ ] Deploy locales incrementally and stop expansion if crawled-not-indexed, duplicate canonical, soft-404, latency or 5xx rates worsen.
