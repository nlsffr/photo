# LeakFanHub Growth Platform — Design Specification

**Date:** 2026-10-29  
**Status:** Approved for implementation  
**Branch:** `fix/search-indexing-20261029`

## User-approved constraints

- Keep existing infrastructure credentials exactly as they are. Do not rotate, replace, revoke, or move them in this delivery.
- Do not disable or delete existing DMCA-related bots or timers.
- Premium must use Telegram Stars, not Stripe.
- Homepage strategy is Option B: rank mostly from source-site views and likes, with freshness, deterministic variation, and creator diversity. Local interactions remain secondary until local traffic grows.
- Implement, test, deploy, and verify the remaining audited fixes.

## Outcomes

1. Operator metrics distinguish accounts, login sessions, daily visitors, page views, and visitors active in the last five minutes.
2. A signed-in user can pay `@LeakFanHubBot` in Telegram Stars and receive premium automatically after a verified payment.
3. Contact and report submissions are durably queued and delivered from the host even though the app container cannot reach Telegram.
4. The homepage changes between visits without `RAND()`, stays grounded in source popularity, avoids creator monopolies, and exposes useful filters on mobile and desktop.
5. Media pages use real database titles and valid video metadata; sitemap partitions are stable and contain video/image extensions.
6. English and French have distinct server-rendered URLs, complete metadata, reciprocal `hreflang`, and `x-default`.
7. Search Console reuses the already-enabled API and existing `leakfanhub-indexer` service account. No key is created or replaced.

## Delivery order

1. Separate source engagement from local engagement.
2. Add measurement and live presence.
3. Add Telegram Stars and durable contact/report notifications.
4. Ship homepage Option B and the new filter UX.
5. Correct media metadata and stable rich sitemaps.
6. Add real English/French SSR routes.
7. Add account verification and password reset once an outbound email sender is configured.

Each slice is independently deployable and reversible.

## Engagement signals

The current `photos.views_count` is mixed: MegaBot imports source views while `/api/photos/view` also increments it locally. Before ranking can honestly be source-led, the database gains:

- `source_views_count` and `source_likes_count`, written only by ingestion;
- `local_views_count`, written only by the site;
- existing columns retained temporarily for backward compatibility.

The homepage uses source metrics as its dominant signal and a capped local signal.

## Measurement model

- `users` means registered accounts, not concurrent visitors.
- `sessions` means login credentials; an unexpired 30-day session is not evidence that the user is online.
- `visitor_id` is a random first-party identifier stored in a SameSite cookie and hashed server-side.
- `daily visitor` is one visitor hash per UTC day with aggregate view count and first/last seen timestamps.
- `online` means a heartbeat within the last five minutes.
- `page view` means an initial document or client navigation, excluding assets, health routes, APIs, and known bots.

The application analytics tables do not persist raw IP addresses.

## Telegram Stars payment flow

1. An authenticated browser creates a pending order for a known plan.
2. The server freezes the exact Stars amount and stores only a SHA-256 hash of a random 32-byte launch token, expiring after 30 minutes.
3. The browser opens `https://t.me/LeakFanHubBot?start=p_<token>`.
4. A Python host worker claims the token and sends one XTR price line with no provider token.
5. It answers `pre_checkout_query` within ten seconds only when payload, order, currency, amount, status, expiry, and Telegram user match.
6. On `successful_payment`, one MariaDB transaction stores the unique Telegram charge ID, marks the order paid, and extends premium from the later of now or the active period end.
7. Duplicate Telegram updates and duplicate charge IDs are idempotent.
8. The site polls only the authenticated user's order and refreshes premium after activation.

The existing bot token stays in its current host configuration and is never committed or returned to the browser.

## Durable notifications

Contact and report APIs insert the submission and an outbox event in the same transaction. A separate host worker leases due rows, sends them to the configured Telegram admin chat, records success, and retries failures with bounded backoff. APIs describe a stored message as stored; they do not claim delivery unless it actually occurred.

## Homepage Option B

The pool is a bounded union of indexed top source views, top source likes, and recent media. A pure deterministic ranker combines:

- 70–80% source engagement;
- 15–20% freshness/source acceleration;
- 5–10% deterministic exploration;
- at most two media from one creator in the first 24 when alternatives exist;
- light photo/video balance when the pool permits;
- optional, capped local follow/like/save/view boosts.

Pagination carries a stable seed and never repeats returned IDs. Filters are grouped into content type, sort, and interests. Common choices stay visible; the long tail lives in an accessible drawer. URL state remains shareable.

## SEO and internationalization

- Media metadata and H1 prefer the real `photos.title`, with a safe fallback only when absent.
- `VideoObject` includes `uploadDate`; `contentUrl` points to the asset; `embedUrl` is omitted unless a real embeddable player exists.
- Media sitemaps include image and video data.
- Sitemap partitions use immutable date buckets plus keyset parts rather than moving OFFSET windows.
- `/sitemap.xml` becomes the canonical sitemap index; `/sitemaps` remains compatible.
- `/en/...` and `/fr/...` render server-side localized shell, metadata, headings, and explanatory copy.
- Because top-level `app/[handle]` conflicts with `app/[lang]`, localized routes use explicit `/en` and `/fr` roots with route groups/multiple root layouts, as supported by bundled Next.js 16 docs.
- Existing unprefixed URLs keep deliberate canonical/redirect behavior.

## Search Console

The API is already enabled in project `leakfanhub`; `leakfanhub-indexer@leakfanhub.iam.gserviceaccount.com` is already a Search Console property owner. Deployment reuses `/opt/photo/dmca/gsc_key.json` to list sites, query performance, inspect a bounded URL sample, and submit `/sitemap.xml`. The general Indexing API is not used for arbitrary media.

## Verification and rollback

- Every behavior starts with a failing focused test.
- All Node/Python tests, TypeScript production build, and production smoke checks pass before completion is claimed.
- Baseline lint currently has 20 pre-existing React 19 violations; no slice may add another, and cleanup is tracked separately.
- Migrations are additive and backward compatible.
- Each slice has its own commit and deployment verification.
- Production checks cover health, critical page status, sitemap XML, order creation without a real charge, worker health, and analytics ingestion.

