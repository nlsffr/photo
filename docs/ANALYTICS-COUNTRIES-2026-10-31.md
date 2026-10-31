# Country percentages for anonymous visitor IDs

The country report answers: which countries are observed, what percentage of
all active IDs each represents, and how much of the 24-hour audience is still
unknown? It does not certify humans, residence, ad acceptance, or ad blockers.

## Collection and counting

- Local DB-IP Country Lite MMDB lookup, IPv4 and IPv6. No visitor IP is written
  to the analytics tables or sent to an external geolocation API.
- Existing Nginx access logs are unchanged. This feature does not remove IPs
  that the existing infrastructure already logs.
- Only page-view events are geolocated, after the existing origin, bot, payload,
  and rate-limit checks. Heartbeats do not increment views or update countries.
- Migration 021 adds nullable `country_code` and `country_observed_at` to
  `analytics_daily_visitors`. Existing rows remain unknown until a new view.
- Keep the first known country per UTC day and ID. The rolling-24-hour report
  chooses the most recent known daily country for each active ID, once only.
  Unknown is part of the denominator; rounded percentages may differ from 100%.
- The report includes the entire country list, not only a top ten. It shows
  coverage, the first retained country observation, and its measurement window.
- Network country is approximate, especially for VPNs, Tor, roaming, and proxies.
  Referrer domains, browser language, and locale never determine country.

## Trust boundary

The app is private on its Docker network. Nginx overwrites `X-Real-IP` with its
actual peer and appends that peer to `X-Forwarded-For`. The new resolver requires
that matching suffix, verifies the peer against explicit CIDRs, and walks the
chain from right to left. Invalid/nonpublic addresses and unverified peers
produce unknown. No public endpoint returns an address or country lookup.

Deployment allowlist, observed 2026-10-31:
`186.2.160.0/24,186.2.167.0/24,186.2.168.0/24,45.10.240.0/24,45.10.241.0/24`.
These are the DDoS-Guard/IQWeb origin networks actually observed here, not a
claim to list all provider ranges. PTRs for 160, 167, 240 and 241 identify
ddos-guard.net; RDAP identifies 45.10.240.0–45.10.243.255 as
RU-LLCDDOS-GUARD-20190425 and 186.2.168.0/24 as IQWEB-LLC-NET.
A controlled GET with a forged XFF prefix confirmed the public proxy appends
the actual client before Nginx appends its peer. The prefix is ignored.
Other CDN peers, including Cloudflare, are deliberately not assumed to be
authorized front proxies merely because their IP belongs to a CDN.

Sources: [ispmanager DDoS-Guard integration](https://www.ispmanager.com/docs/ispmanager-5/integration-with-ddos-guard),
[RIPE RDAP](https://rdap.db.ripe.net/ip/45.10.240.0),
[IP registry RDAP](https://rdap.org/ip/186.2.168.0),
[DB-IP Country Lite](https://db-ip.com/db/download/ip-to-country-lite),
[MaxMind reader](https://github.com/runk/node-maxmind).

## Operator commands

```sh
docker exec photo-app-1 node scripts/analytics-country-report.mjs
docker exec photo-app-1 node scripts/analytics-country-report.mjs --html > countries.html
```

The HTML is a private, standalone snapshot, not a public route or automatically
refreshing dashboard. It includes the required DB-IP attribution. JSON contains
the same attribution and no individual IDs or IPs.

## Deployment and maintenance

1. Apply migration 021 with a short metadata-lock timeout. It is additive,
   idempotent and uses INSTANT; the previous app ignores the new columns.
2. Prepare `/opt/photo/geoip` owned by UID 1001, mode 755. Run the new image's
   `scripts/update-country-db.mjs` with `ANALYTICS_COUNTRY_DB=/geoip/country.mmdb`
   and a writable bind of that directory. Validate the resulting DB before use.
3. Build from the clean committed source, not the dirty `/opt/photo` checkout.
   Preserve current application environment and topology; add only
   `ANALYTICS_COUNTRY_DB=/app/geoip/country.mmdb`, the verified
   `ANALYTICS_TRUSTED_PROXY_CIDRS`, and the directory bind mounted read-only.
   `docker-compose.analytics.yml` documents the optional compose overlay.
4. Test a candidate container before swapping the app and reloading Nginx.
   Preserve the previous container and its configuration for rollback.
5. Install `infra/analytics/geoip-update.{service,timer}`. The daily timer checks
   for the current monthly release. An already validated current release avoids
   a download. A missing new release or failed download leaves the old file
   untouched and the job visibly failed; the next scheduled run retries.
   `journalctl -u geoip-update.service` shows only release/error metadata.
6. The app checks the file mtime at most once per minute and retains its last
   validated reader if a refresh fails. A missing initial reader records unknown
   without dropping the page-view event. No per-request network lookup.

Rollback: restore the previous application container/environment, reconnect its
original Docker network alias, reload Nginx, verify `/api/readyz`. Disable only
the new `geoip-update.timer` if rolling back to an image without its script.
Leave the additive columns and collected data in place. Existing media, bots,
URLs, credentials, and database rows outside analytics are outside this change.

## Verification

- Resolver tests: forged prefix, unknown peer, malformed chain, private and
  documentation addresses, IPv6/mapped IPv4, and unknown country codes.
- Report tests: denominator includes unknown, all countries returned, empty
  window, escaped HTML and attribution.
- MariaDB temporary-table integration: first-known-per-day semantics,
  unknown-to-known transition, heartbeat behavior, cross-day deduplication,
  most recent known daily country, and outside-window exclusion. No production
  analytics rows were changed by this SQL test.
- Local build and TypeScript pass; production dependency audit reports no
  known vulnerabilities. Final deployment evidence is appended after rollout.

## Production activation

Activated **2026-10-31 21:37 UTC (22:37 Paris)**. Image:
`photo-app:countries-960e90c-20261031`; feature source commit `960e90c`.
GitHub main also preserves the independently added metadata-tool commits via
merge `0acf260`; those tools were neither deployed nor executed by this task.

- Migration 021 applied successfully with INSTANT and bounded lock wait.
- 288/288 tests pass; full lint, TypeScript and local/production builds pass.
  The existing Next static Cache-Control advisory is unchanged.
- Candidate HTTP-to-database checks passed: local lookup writes US for a known
  test address, a forged prefix is ignored, an untrusted peer records unknown,
  views count exactly, and a heartbeat creates no daily country row. All three
  disposable fixture identifiers were removed from analytics after the test.
- Public readiness and `/fr` return 200 after activation. Existing environment
  entries were preserved. The GeoIP directory is mounted read-only in the app.
- First organic country observation: `2026-10-31T21:37:48.366Z`.
  The first report already contained six distinct countries. This tiny initial
  sample is not representative of the preceding 24-hour audience.
- `geoip-update.timer` is enabled. A real manual invocation of its service
  succeeded (exit 0); it will retry monthly-release availability daily.
- Rollback container: `photo-app-rollback-countries-20261031T213656Z`.
  Protected configuration backup:
  `/opt/photo/backups/countries-deploy-20261031T213656Z`.
  Deployment state: `/opt/photo-analytics-countries-960e90c/deployment-state.json`.
