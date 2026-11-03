# Separate page-response counter

The user explicitly requested a separate Maison Studio counter covering requests regardless of cookie preference. Existing consented visitor and page-view analytics remain unchanged. This counter measures successful page/RSC responses at the origin, not unique people, sessions or reliably displayed pages. Reloads/retries can count repeatedly; browser caches may avoid origin requests; undeclared bots may remain. Never subtract the two counters to estimate cookie refusals.

## Collection contract

- Nginx classifies GET/200 HTML documents and RSC responses into mutually exclusive classes. Exclude assets, APIs/admin/internal routes, known automated User-Agents, actions/HMR and declared prefetch/prerender (including router and segment prefetch headers).
- Emit only `MAISON_PAGE_V1 <msec> <document|flight>` to a second stdout log. Do not include or consult cookies; do not emit URL/query/referrer, IP, raw User-Agent or a visitor identifier. Preserve the pre-existing main access log and verify one marker per eligible response with real Nginx fixtures.
- A separate root-owned service reads the Docker JSON log strictly read-only, recognizes the full marker in a parsed stdout record, and stores only minute counters and its source cursor. Initial activation begins at EOF, not by retrospectively treating old access logs as this new measurement.
- Docker discourages external access to json-file internals. This implementation deliberately uses a bounded, read-only reader for durable byte offsets without inventing request identifiers or adding a new edge mount/logging network. It never rotates/truncates/writes Docker logs. Cursor and counters are committed atomically, protected by a single-instance lock; rotations, truncation, missing history or source changes must be handled or persist as coverage gaps.
- Resource limits protect ingestion/restoration workers. No app/DB restart, media write, credential/certificate change or tracking endpoint is needed.

## Maison contract

Private atomic report `/var/lib/maison-pages/summary.json`:

```
{version:1, observedAt:ISO, startedAt:ISO, timezone:"Europe/Paris",
 unit:"page_responses", resolutionSeconds:60,
 state:"available"|"stale"|"unavailable",
 periods:{today:{start:ISO,end:ISO,count:int|null,coverage:"complete"|"partial"|"unavailable"},
          yesterday:{...},last24h:{...}}, issues:[controlledCodes]}
```

Use Paris calendar boundaries for days (including daylight-saving changes) and 1440 completed UTC minutes for the rolling window. Explicitly state minute resolution/date of end. Periods entirely before activation are unavailable with null counts, never invented zeros. Periods spanning activation or a recorded gap are partial. Backlog, unavailable source or heartbeat at least 90 seconds old cannot appear as current complete results.

The collector validates a bounded JSON schema and passes only aggregate fields as snapshot.serverPages. Maison displays a separate existing-style Activity card with today/yesterday/24h, coverage/start date, and the counting limitations. No new polling, room-device changes or redesign.

## Verification and publication

1. Tests for exclusive document/RSC classification, consent-independent matching, bots/prefetch/assets/actions, marker privacy and preserved main logging.
2. Tests for initial EOF, atomic crash/replay, partial lines, rotation/truncation/source changes, singleton lock, stale/backlog/gap reporting, Paris/DST and rolling-minute boundaries.
3. Collector bounded/private/schema/freshness tests and actual DOM rendering of available/partial/unavailable states.
4. Review, explicit-file commits and push. Deploy only committed files with private backups and compare-and-swap guards. Validate new Nginx configuration in isolation, then install the include and reload Nginx without recreating edge or restarting app/DB/bots/repairs. Roll back the include/config in place if needed because the existing default.conf is file-bind-mounted.
5. Verify anonymous markers, durable aggregate growth, private summary through VPS/Mac relay, served UI, readiness, unchanged process identities and existing consent behavior. Keep unavailable historical periods visible as such. Do not publish account metrics, raw logs or device credentials in this public repository.

References: [NGINX log module](https://nginx.org/en/docs/http/ngx_http_log_module.html), [Docker json-file logging](https://docs.docker.com/engine/logging/drivers/json-file/), [Next.js prefetching](https://nextjs.org/docs/app/guides/prefetching), [CNIL audience-measurement conditions](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience). This design is not a claim of certification by a regulator.
