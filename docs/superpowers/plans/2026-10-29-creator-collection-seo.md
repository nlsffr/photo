# Creator Collection SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish useful, indexable EN/FR creator overview, photo, video and popular pages without exposing removed content or creating thin duplicates.

**Architecture:** A pure creator-collection policy owns route parsing, eligibility, paths, pagination and localized copy. The data provider returns one bounded aggregate per creator, and a shared server renderer serves explicit unprefixed routes plus the existing EN/FR catch-all. The proxy recognizes collection segments before media lookup, while structured data reuses already-loaded media and only real creator names.

**Tech Stack:** Next.js 16.4 App Router, React 19 server components, TypeScript, MariaDB/mysql2, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-29-programmatic-seo.md`

## Global Constraints

- Do not unmask, re-publish, delete or change the version of DMCA-flagged creators or media.
- Do not rotate, replace, revoke or move existing infrastructure credentials.
- EN/FR creator pages are the only localized creator pages in this plan; media pages remain unprefixed.
- `photos`, `videos` and `popular` are reserved collection segments and never resolve as media IDs.
- Overview requires 1 public media; photos requires 12 public photos; videos requires 4 public videos; popular requires 24 public media and 8 with positive imported source engagement.
- Real numbered pages have self-referencing canonicals; page 2 never canonicalizes to page 1.
- JSON-LD escapes `<` as `\u003c`; `hasPart`/`ItemList` reuse loaded items and contain at most 12 entries.
- A creator page uses at most four database round trips and no per-item query.
- Only real display names, handles and later verified database aliases may appear in SEO metadata; generated typos and competitor-imported aliases are excluded.

## Review Focus

- A creator/media identifier literally equal to `photos`, `videos` or `popular` must follow collection routing, never media lookup.
- Malformed percent encoding, reserved handles and obsolete `-vN` creator versions must return the existing safe 404/410 behavior without throwing.
- Removed creators/media must remain absent from counts, lists, structured data and links.
- Page numbers `0`, negative, non-integer and excessively large values must not create indexable duplicates.
- EN/FR/unprefixed canonicals and hreflang must remain reciprocal for overview and every eligible collection.

---

### Task 1: Creator collection policy and safe serialization

**Files:**
- Create: `src/lib/creator-collections.ts`
- Create: `src/lib/creator-names.ts`
- Create: `src/lib/json-ld.ts`
- Modify: `src/components/JsonLd.tsx`
- Test: `tests/creator-collections.test.ts`
- Test: `tests/json-ld.test.ts`
- Test: `tests/seo-aliases.test.ts`

**Interfaces:**
- Produces: `CreatorCollection = "overview" | "photos" | "videos" | "popular"`.
- Produces: `CreatorCollectionStats = { mediaCount: number; photoCount: number; videoCount: number; engagedCount: number; totalViews: number; totalLikes: number }`.
- Produces: `collectionIsEligible(collection, stats): boolean`, `summarizeCreatorCollectionStats(media): CreatorCollectionStats`, `parseCreatorCollectionPath(pathname): { handle: string; collection: CreatorCollection } | null`, `parseCreatorPage(raw): { page: number; valid: boolean }`, `creatorCollectionPath(handle, urlVersion, collection, locale?, page?): string`, and localized copy/metadata helpers.
- Produces: `serializeJsonLd(data): string` in `src/lib/json-ld.ts` with `<` escaped as `\u003c`.
- Produces: `verifiedCreatorNames(handle, displayName, verifiedAliases?): string[]` with no generated/imported names.

- [ ] **Step 1: Write failing policy tests**

Add literal table-driven assertions for all four thresholds; EN/FR/unprefixed paths; page 1 omission; self-canonical page 2; malformed/zero/negative/huge pages; percent-decoding failure; reserved collection segments; and `-vN` handles.

- [ ] **Step 2: Write failing serializer and alias tests**

Assert that `</script>` becomes `\u003c/script>` in serialized JSON-LD, and that the alias helper returns only deduplicated handle/display name/explicit verified aliases—never `generateTypoAliases` or `creator-aliases.json` data.

- [ ] **Step 3: Run the focused tests and observe RED**

Run: `node --experimental-strip-types --test tests/creator-collections.test.ts tests/json-ld.test.ts tests/seo-aliases.test.ts`
Expected: FAIL because the new exports do not exist.

- [ ] **Step 4: Implement the minimal pure policy**

Implement the exact interfaces above. Use a maximum accepted page of 10,000; path builders omit `?page=1` and append `?page=N` only for `N >= 2`. Keep the new public creator-name module independent of `seo-aliases.ts` and `creator-aliases.json`; legacy scripts may remain, but no runtime route may import them.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --experimental-strip-types --test tests/creator-collections.test.ts tests/json-ld.test.ts tests/seo-aliases.test.ts`
Expected: PASS.

```bash
git add src/lib/creator-collections.ts src/lib/creator-names.ts src/lib/json-ld.ts src/components/JsonLd.tsx tests/creator-collections.test.ts tests/json-ld.test.ts tests/seo-aliases.test.ts
git commit -m "feat: define safe creator collection SEO policy"
```

### Task 2: Public creator aggregate and collection query

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/data-provider.ts`
- Modify: `src/lib/photos.ts`
- Modify: `src/lib/providers/mariadb.ts`
- Modify: `src/lib/providers/demo.ts`
- Test: `tests/creator-collection-data.test.ts`
- Test: `tests/mariadb-query-plan.test.ts`

**Interfaces:**
- Consumes: `CreatorCollection`, `CreatorCollectionStats` from Task 1.
- Produces: `DataProvider.getCreatorCollectionStats(handle): Promise<CreatorCollectionStats>`.
- Produces: `getCreatorCollectionStats(handle): Promise<CreatorCollectionStats>` with request cache.
- Produces: existing `getPhotos()` behavior for collection filters: overview=`recent`, photos=`recent+photo`, videos=`recent+video`, popular=`popular`.

- [ ] **Step 1: Write failing aggregate behavior tests**

Use the real pure summarizer from Task 1 with complete photo/video/pack fixtures. Assert literal media/photo/video/engaged counts and that removed rows never contribute. Test the demo provider against its real fixture corpus rather than a mock.

- [ ] **Step 2: Write the MariaDB boundary test**

Assert the aggregate SQL joins the creator, applies `activeMediaSql`, counts `type='photo'`, counts `type='video'`, and treats positive `source_views_count` or `source_likes_count` as engaged. Assert one aggregate statement, not one statement per media row.

- [ ] **Step 3: Run focused tests and observe RED**

Run: `node --experimental-strip-types --test tests/creator-collection-data.test.ts tests/mariadb-query-plan.test.ts`
Expected: FAIL because the provider method and aggregate query are missing.

- [ ] **Step 4: Implement one bounded aggregate**

Add the provider interface and demo/MariaDB implementations. The MariaDB query returns zeroed counts for a valid creator with no public media and applies a five-second statement budget. Cache the public wrapper per request; do not add a global cache that could retain removal state.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --experimental-strip-types --test tests/creator-collection-data.test.ts tests/mariadb-query-plan.test.ts`
Expected: PASS.

```bash
git add src/lib/types.ts src/lib/data-provider.ts src/lib/photos.ts src/lib/providers/mariadb.ts src/lib/providers/demo.ts tests/creator-collection-data.test.ts tests/mariadb-query-plan.test.ts
git commit -m "feat: expose public creator collection stats"
```

### Task 3: Unprefixed collection pages, pagination and proxy routing

**Files:**
- Create: `src/features/creator/CreatorCollectionPage.tsx`
- Create: `src/app/(default)/[handle]/photos/page.tsx`
- Create: `src/app/(default)/[handle]/videos/page.tsx`
- Create: `src/app/(default)/[handle]/popular/page.tsx`
- Modify: `src/app/(default)/[handle]/page.tsx`
- Modify: `src/proxy.ts`
- Modify: `src/lib/seo-policy.ts`
- Test: `tests/creator-route-policy.test.ts`
- Test: `tests/proxy-matcher.test.ts`

**Interfaces:**
- Consumes: Task 1 paths/eligibility/copy and Task 2 stats.
- Produces: `CreatorCollectionPage({ locale, handleParam, collection, searchParams })` and `creatorCollectionMetadata(...)` for route wrappers and Task 4.

- [ ] **Step 1: Write failing routing and pagination tests**

Cover collection recognition before media lookup, valid and obsolete creator versions, exact legacy `?type=photo|video`/`?sort=popular` redirect targets, arbitrary sort `noindex,follow`, self-canonical page 2, noindex invalid pages, and the reserved media-ID collision.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `node --experimental-strip-types --test tests/creator-route-policy.test.ts tests/proxy-matcher.test.ts`
Expected: FAIL because collection routing is not registered.

- [ ] **Step 3: Build the shared server renderer and explicit routes**

Load creator, public stats and one page of 30 items. Return `notFound()` below the collection threshold. Render clean collection tabs only when eligible, a visible localized collection explanation, `InfiniteGallery`, and a crawlable numbered next link whose default click may append client-side without replacing the document. Keep overview behavior through the shared renderer.

- [ ] **Step 4: Teach the proxy collection precedence**

Before two-segment media lookup, decode and validate `/{handle}/{collection}`, enforce the current creator URL version/removal decision, and pass eligible candidates to Next. Do not query a media ID for the three reserved collection words. Keep every existing machine-namespace and DMCA response unchanged.

- [ ] **Step 5: Run focused tests, build and commit**

Run: `node --experimental-strip-types --test tests/creator-route-policy.test.ts tests/proxy-matcher.test.ts tests/removed-content-policy.test.ts`
Expected: PASS.

Run: `npm run build`
Expected: Next.js production build succeeds with no route collision.

```bash
git add src/features/creator/CreatorCollectionPage.tsx 'src/app/(default)/[handle]' src/proxy.ts src/lib/seo-policy.ts tests/creator-route-policy.test.ts tests/proxy-matcher.test.ts
git commit -m "feat: add crawlable creator collection routes"
```

### Task 4: Localized EN/FR creator dispatcher and metadata

**Files:**
- Modify: `src/features/i18n/LocalizedPage.tsx`
- Modify: `src/lib/i18n/config.ts`
- Modify: `src/lib/i18n/metadata.ts`
- Modify: `src/lib/i18n/dictionaries/en.ts`
- Modify: `src/lib/i18n/dictionaries/fr.ts`
- Modify: `src/app/(en)/en/[[...path]]/page.tsx`
- Modify: `src/app/(fr)/fr/[[...path]]/page.tsx`
- Test: `tests/creator-i18n-routing.test.ts`
- Test: `tests/metadata-alternates.test.ts`

**Interfaces:**
- Consumes: shared renderer and metadata interface from Task 3.
- Produces: typed dispatch for `/en|fr/{handle}` and `/en|fr/{handle}/{photos|videos|popular}` after exact static routes, with no localized media dispatch.

- [ ] **Step 1: Write failing localized route and alternate tests**

Assert that exact paths such as `/en/contact/support` win before creator parsing; creator and collection paths dispatch correctly; `/en/{handle}/{media-id}` stays 404; every overview/collection canonical is self-referencing and has reciprocal `en`, `fr` and unprefixed `x-default` URLs including page numbers.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `node --experimental-strip-types --test tests/creator-i18n-routing.test.ts tests/metadata-alternates.test.ts`
Expected: FAIL because dynamic creator paths currently fall through to `notFound()`.

- [ ] **Step 3: Extend the dispatcher after static-route priority**

Make localized metadata generation asynchronous where required. Route only parsed creator overview/collection patterns to the shared renderer. Add complete EN/FR titles, descriptions, headings, tabs and explanatory copy; never translate creator-authored names/bios or create localized media pages.

- [ ] **Step 4: Run focused tests, build and commit**

Run: `node --experimental-strip-types --test tests/creator-i18n-routing.test.ts tests/metadata-alternates.test.ts tests/i18n-policy.test.ts tests/i18n-routing.test.ts`
Expected: PASS.

Run: `npm run build`
Expected: production build succeeds.

```bash
git add src/features/i18n/LocalizedPage.tsx src/lib/i18n 'src/app/(en)' 'src/app/(fr)' tests/creator-i18n-routing.test.ts tests/metadata-alternates.test.ts
git commit -m "feat: localize creator collections in English and French"
```

### Task 5: Creator structured data and internal-link contract

**Files:**
- Create: `src/lib/creator-structured-data.ts`
- Modify: `src/features/creator/CreatorCollectionPage.tsx`
- Modify: `src/components/CreatorCard.tsx`
- Modify: `src/app/(default)/[handle]/[id]/page.tsx`
- Test: `tests/creator-structured-data.test.ts`
- Test: `tests/creator-link-policy.test.ts`

**Interfaces:**
- Consumes: Task 1 safe serializer/names and Task 3 paths.
- Produces: pure `buildCreatorStructuredData(input)` in `src/lib/creator-structured-data.ts`; overview `ProfilePage` + `Person`; collection `CollectionPage` + `ItemList`; maximum 12 public `hasPart`/list entries; localized creator links from localized surfaces; media links back to the matching photo/video section and overview.

- [ ] **Step 1: Write failing schema and link tests**

Use literal fixtures to assert schema types, creator URL, safe `alternateName`, positions 1–12, zero removed items, escaped hostile title text, and photo/video backlinks. Mutating any item to removed must make it disappear without a replacement query.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `node --experimental-strip-types --test tests/creator-structured-data.test.ts tests/creator-link-policy.test.ts`
Expected: FAIL because the shared schemas and clean backlinks are missing.

- [ ] **Step 3: Implement bounded structured data and links**

Build schema data from the creator, stats and already-loaded page only. Use `verifiedCreatorNames`; never call the legacy generated-alias helpers. Make creator cards preserve the current locale where the caller supplies one and keep unprefixed compatibility elsewhere.

- [ ] **Step 4: Run the complete local suite and commit**

Run: `node --experimental-strip-types --test tests/*.test.ts`
Expected: all tests PASS.

Run: `npm run build`
Expected: production build succeeds.

```bash
git add src/lib/creator-structured-data.ts src/features/creator/CreatorCollectionPage.tsx src/components/CreatorCard.tsx 'src/app/(default)/[handle]/[id]/page.tsx' tests/creator-structured-data.test.ts tests/creator-link-policy.test.ts
git commit -m "feat: enrich creator collection structured data"
```

## Final verification and deployment gate

After all reviewed tasks, run `node --experimental-strip-types --test tests/*.test.ts && npm run build`, then start the production build on an unused local port with demo data. Check representative eligible/ineligible overview, photos, videos and popular routes in unprefixed/EN/FR forms; page 2 canonicals; invalid/reserved routes; JSON-LD parsing; and absence of localized media routes. Browser-check desktop/mobile tabs, load-more append behavior, direct page-2 access, back navigation, 404 handling and layout stability.

Do not deploy while the VPS origin and SSH remain unavailable. Deployment later requires a production DB collision audit for public IDs `photos`, `videos`, `popular`, remote build, health checks, representative 200/404/410 responses and Search Console validation.
