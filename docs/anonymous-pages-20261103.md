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

## Verified publication

The backend was published from `c5273e52261a6ef71914bd67dc3e8bb85dd35c70`, with capture starting 3 November 2026 at 00:45:16 UTC. The independent service is active/enabled; its report is root-owned 0600 in a 0700 state directory. The app, edge and database container identities/start times stayed unchanged, the queue stayed active, and public readiness returned 200. The only existing service restarted for the UI integration was the Maison measurement collector.

Maison source `22c0876` was published to VPS, Mac relay and delivery copy. Private API and relay returned the aggregate report; served HTML/JS matched the committed files. A real 1194×834 browser showed the separate card updating, with the unmeasured previous day unavailable and the current day/rolling window explicitly partial. No camera stream or device command was used. The physical iPad was not observed; a full close/reopen loads the updated web assets.

Verification: 16 reader tests, 68 real isolated Nginx cases (including identical behavior for absent/accepted/refused cookie headers), eight collector tests and nine UI tests. Operator guards and rollback were separately tested. Detailed account measurements and private receipts remain outside the public repository.

The first activation was safely rolled back because the new maps preceded the existing generated `map_hash_bucket_size` setting. **Load the existing removed-media maps/settings before the anonymous-page include.** The corrected order passed the actual production-context configuration test before publication. The failed installation, zero-count state and its backups were archived, not deleted. A durable activation gap covers the brief interval between reader startup and logging reload; it cannot appear as complete coverage later.

Rollback remains split: restore only the three guarded Maison files/restart its measurement collector, then restore the verified old Nginx bytes in place/reload and disable only the new counter. Preserve aggregate state, archives, media, existing services, credentials and certificates. Before a future reactivation after a disabled interval, account for that interval as a coverage gap rather than assuming continuous measurement.
