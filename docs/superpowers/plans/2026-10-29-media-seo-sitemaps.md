# Media SEO and Rich Sitemap Plan

> **Spec:** `docs/superpowers/specs/2026-10-29-growth-platform.md`

**Goal:** Expose the best existing media metadata to users and Google, with stable rich sitemap partitions.

**Architecture:** A pure formatter supplies titles, descriptions, canonical URLs, and video JSON-LD from database rows. Sitemap queries use immutable UTC date buckets and keyset parts, and explicit XML includes image/video namespaces. `/sitemap.xml` becomes the canonical index while `/sitemaps` remains compatible.

### Task 1: Real media metadata policy

**Files:**
- Create: `src/lib/media-seo.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/providers/mariadb.ts`
- Test: `tests/media-seo.test.ts`

1. Write failing tests for real-title preference, safe fallback, bounded factual description, upload date, valid content URL, and no fake embed URL.
2. Select `description` and `created_at` with media rows.
3. Implement pure formatters.

### Task 2: Render corrected media pages

**Files:**
- Modify: `src/app/[handle]/[id]/page.tsx`
- Modify: `src/app/photo/[id]/page.tsx`

1. Use real title in metadata, H1, OpenGraph, and JSON-LD.
2. Add `uploadDate`/`datePublished`, keep `contentUrl`, omit page-self `embedUrl`.
3. Share the media load between metadata and page where Next caching semantics permit.

### Task 3: Stable partitions

**Files:**
- Create: `migrations/018-stable-sitemap-partitions.sql`
- Modify: `src/lib/sitemap-data.ts`
- Modify: `src/lib/seo-policy.ts`
- Test: `tests/sitemap-partitions.test.ts`

1. Test that inserting a newer row never moves URLs in closed date buckets.
2. Add the supporting `(created_at,id)` index and date/keyset queries.
3. Split only a date exceeding the protocol limit; keep each file under 10,000 entries for bounded response time.
4. Exclude removed media and removed creators; omit unknown `lastmod` instead of using current time.

### Task 4: Rich XML and canonical index

**Files:**
- Create: `src/lib/sitemap-xml.ts`
- Modify: `src/app/sitemaps/media/[chunk]/route.ts` or replace with stable date/part routes
- Modify: `src/app/sitemaps/popular/route.ts`
- Modify: `src/app/sitemaps/route.ts`
- Replace: `src/app/sitemap.ts` with a route-owned `/sitemap.xml` index if required
- Test: `tests/sitemap-xml.test.ts`

1. Test namespaces, escaping, canonical page URL, image, video title/description/thumbnail/content URL/upload date, and exclusion rules.
2. Emit video/image XML and a canonical index at `/sitemap.xml`.
3. Keep `/sitemaps` compatible through identical content or permanent redirect.
4. Validate sample output with an XML parser.

### Task 5: Search Console API

**Files:**
- Create: `scripts/search-console-report.py`
- Modify: `docs/DEPLOY.md`

1. Reuse `/opt/photo/dmca/gsc_key.json` and request only Search Console scopes.
2. List the property, query performance, inspect a bounded sample, and submit `/sitemap.xml`.
3. Never print private keys or access tokens.

### Task 6: Verify and commit

1. Run focused SEO/XML tests, all Node tests, and `npm run build`.
2. Deploy and curl the sitemap index plus representative image/video entries.
3. Submit `/sitemap.xml` through the API and record only non-secret status.
4. Commit: `feat: publish rich stable media sitemaps`.

