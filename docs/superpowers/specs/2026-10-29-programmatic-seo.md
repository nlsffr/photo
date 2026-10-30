# LeakFanHub Programmatic SEO — Design Specification

**Date:** 2026-10-29
**Status:** Approved for implementation
**Branch:** `fix/search-indexing-20261029`

## Intent

Build the useful parts of LeakGallery's search footprint without copying its
thin or deceptive pages: one stable page for each real creator/media intent,
descriptive immutable URLs, accurate metadata, strong internal links, and
sitemaps that contain only public 200 responses.

This delivery does not unmask DMCA-flagged creators or media, change existing
infrastructure credentials, or manufacture pages whose only purpose is to rank.
The current production 502/SSH outage is a separate incident and must be fixed
from runtime evidence before this SEO work is deployed.

## Current constraints

- Next.js 16.4 App Router has an unprefixed top-level `[handle]` route.
- English and French have explicit `/en` and `/fr` catch-all wrappers.
- Creator filters currently use query parameters and share one canonical URL.
- Media URLs use an opaque public ID and an optional `-vN` suffix.
- The public profile sitemap is capped at 50,000 rows and is not partitioned.
- Media sitemap partitions are already immutable and should remain so.
- Alias data currently mixes imported names and generated misspellings. Only
  verified aliases may become indexable metadata.

## URL model

### Creator intents

Each eligible creator has these real pages:

- `/{locale}/{handle}` — overview/recent mixed media;
- `/{locale}/{handle}/photos` — photos only;
- `/{locale}/{handle}/videos` — videos only;
- `/{locale}/{handle}/popular` — a popularity order distinct from recent.

The equivalent unprefixed creator and collection URLs exist and remain the
`x-default` during the EN/FR migration. The three collection words are reserved
as route segments and may not resolve as media IDs.

Legacy exact combinations such as `?type=video` permanently redirect to the
matching clean collection. Arbitrary filter/sort combinations remain usable but
are `noindex,follow` and excluded from sitemaps. Real numbered pagination uses
one URL per page, a self-referencing canonical, and sequential HTML links;
page 2 never canonicalizes to page 1. The visual “load more” control may append
in place while retaining a crawlable page link as its non-JavaScript contract.

### Media pages

The target media URL is:

`/{handle}/{stored-seo-slug}[-vN]`

`photos.seo_slug` is created once from the source title, creator name, media
type and a bounded tag subset, and is stored with a unique index. It includes a
human-readable prefix plus a collision-resistant suffix, but request handling
never tries to reverse-parse an ID from it. The loader first performs an exact
indexed `seo_slug` lookup; only the compatibility branch looks up an old public
ID. A later title edit never changes the stored slug or URL.

Legacy opaque URLs for the current public version return a permanent `308`
redirect to the descriptive URL. Requests for obsolete `url_version` values
keep the existing 404/410 removal policy and never redirect to a new version.
Canonical tags, cards, internal links, and sitemaps switch only after the stored
slug exists. Rollout is incremental so the whole corpus never churns at once.

## Eligibility and duplicate control

Initial conservative thresholds:

- overview: at least 1 public media item;
- photos: at least 12 public photos;
- videos: at least 4 public videos;
- popular: at least 24 public media items, including at least 8 with a positive
  imported source view/like signal. Its order is always the documented source
  engagement score rather than recency.

Thresholds are configurable and validated against production counts before
deployment. A section below threshold is excluded from navigation and every
sitemap, and returns `404` rather than a thin page. Removed creators/media are
filtered by the existing public-content policy in every query.

## Page content and structured data

Creator pages contain:

- a unique localized title, description, H1, explanatory paragraph and
  breadcrumb for the selected intent;
- exact visible media counts;
- `ProfilePage` whose `mainEntity` is a `Person`;
- verified `alternateName` values only;
- a bounded `hasPart` list pointing to canonical `ImageObject`/`VideoObject`
  pages;
- reciprocal EN/FR `hreflang` plus `x-default`;
- links between overview, photos, videos and popular only when eligible.

Overview pages use `ProfilePage` + `Person`; section pages use
`CollectionPage` + a bounded `ItemList`. JSON-LD is serialized with `<` escaped
as `\u003c` before it is inserted into the script element.

Media pages contain:

- an immutable descriptive URL;
- source-authored title/description when present and a factual fallback when
  absent;
- `ImageObject` or `VideoObject`, publisher, creator, breadcrumb, upload date,
  dimensions/duration where known, and real engagement metrics;
- links back to the relevant creator section and to related public media.

No fabricated spelling variants appear in titles, descriptions, structured
data, navigation, or sitemaps.

## Alias model

Add a normalized `creator_aliases` source with creator ID, alias, provenance,
verification state, and timestamps. A unique normalized alias belongs to one
creator. Only verified aliases feed search, metadata and
`Person.alternateName`. Alias URLs, if retained for compatibility, redirect to
the canonical creator and never enter a sitemap.

Until the table is populated and verified, use the real display name and handle
only. Imported competitor aliases and generated typos are not trusted SEO data.

## Query and performance budget

A creator request uses at most four database round trips: creator with public
counts, one bounded media page, verified aliases, and related creators when
shown. `hasPart` reuses the already loaded page and is capped at 12 items. It
never triggers per-item queries. Sitemap partitions use one grouped/keyset
query whose projection includes active media count, photo count, video count,
engaged media count and last public media update. Supporting indexes and
`EXPLAIN` plans are verified before deployment.

## Internationalization

Phase 1 consolidates EN/FR in one locale registry and makes creator intent pages
fully server-rendered in both languages. That registry owns route prefix,
`htmlLang`, Open Graph locale, dictionary loader, localized metadata and sitemap
alternates.

Phase 2 adds ES/DE/IT/PT through explicit static wrappers, not a dynamic root
`[locale]` that would conflict with `[handle]`. A language becomes indexable
only after its complete visible copy, metadata, reciprocal hreflang and tests are
ready. Media pages remain unprefixed until there is enough genuinely localized
content to justify multiplying them.

## Sitemap architecture

Replace the single profile file with immutable keyset partitions of about 1,000
creators for:

- profile overview;
- photos sections;
- videos sections;
- popular sections.

The public collection endpoints are grouped below
`/sitemaps/collections/{photos|videos|popular}`; the profile overview keeps its
own partition family. The sitemap index is updated for each new family.

Each localized entry has reciprocal alternates and `x-default`. A query supplies
public media count, photo count, video count and `updated_at`, and applies the
same eligibility rules as the page. Each XML file must stay below 50,000 URLs
and 50 MiB uncompressed.

Existing rich media partitions remain the authoritative media sitemap. New
descriptive URLs are emitted only after their immutable slug is persisted.
Persisting a last-known-good manifest is explicitly deferred from the first
delivery. If added later, it stores only the sitemap-file manifest (never cached
page URLs), uses atomic rename, has a bounded maximum age, and is ignored at
startup when absent or stale so removed content can never survive in a cached
URL list.

## Internal linking

- Creator cards link to the localized overview.
- Creator tabs use clean section URLs rather than query parameters.
- Media pages link to the matching photo/video section and the overview.
- Overview pages expose eligible section links and a bounded set of related
  creators based on real tags/categories.
- Numbered collection pagination is self-canonical and crawlable; no `RAND()`
  and no orphaned pages. Sitemap partitioning, separately, uses stable keysets.

## Routing and middleware

The unprefixed App Router receives three static siblings:

- `[handle]/photos/page.tsx`;
- `[handle]/videos/page.tsx`;
- `[handle]/popular/page.tsx`.

They sort ahead of `[handle]/[id]`; no sibling dynamic `[collection]` route is
created. The localized EN/FR catch-all resolves known static application routes
first, then creator overview and collection patterns only. No localized media
page is created in phase 1. The non-prefixed request proxy must recognize the
three collection slugs before its two-segment media lookup, or it would treat
`photos`, `videos` and `popular` as media IDs. Production data is audited for
colliding public media IDs before rollout.

## Rollout and measurement

1. Ship clean EN/FR creator sections, alias safety and tests.
2. Ship partitioned creator-section sitemaps.
3. Add immutable media slugs and redirect a small cohort before expanding.
4. Add the verified-alias table and migrate curated aliases.
5. Add ES/DE/IT/PT one complete locale at a time.

For each stage record sitemap URL count, valid indexed pages, excluded reasons,
impressions, clicks, CTR, average position, crawl errors and response latency.
Stop expansion if 5xx, duplicate canonical, soft-404 or crawled-not-indexed rates
materially worsen.

## Acceptance criteria

- Every sitemap URL resolves to an indexable public 200 response.
- All locale alternates are reciprocal and include `x-default`.
- Empty/weak creator sections are absent and return 404.
- Legacy media URLs redirect once to a stable descriptive canonical.
- Media title edits do not change published URLs.
- Removed content stays unavailable on pages, APIs, internal links and sitemaps.
- Only verified aliases appear in metadata or structured data.
- Focused unit/integration tests, the production build and post-deploy smoke
  checks pass before completion is claimed.
- Tests cover UUID/hyphenated legacy IDs, `-vN` suffixes, slug collisions,
  reserved handles, one-hop redirects, self-canonical pagination, reciprocal
  hreflang, partition stability across insertions/removals, DMCA exclusions and
  the SQL query budget.
