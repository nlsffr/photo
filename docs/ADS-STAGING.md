# Advertising preparation

The master switch defaults to **OFF**. A saved placement selection does not activate advertising. With OFF, the public page creates no advertising script, iframe or preconnect. Private previews use local markup only.

Public delivery requires a current server decision, explicit versioned advertising consent (`lfh_ad_consent=v1:accepted`), age confirmation and an eligible non-Premium, non-owner session. Statistics consent does not grant advertising consent. Unknown or expired eligibility closes delivery. Configuration is read without browser caching, normally every 15 seconds and on focus/session changes. SDKs with document listeners are removed through a clean page reload after revocation or a configuration change.

`/admin/ads` requires exactly one configured owner. The master control applies ON/OFF in one click using saved placements and confirms only the exact server response. Placement drafts are saved separately. Timeout, conflict or an inconsistent response marks the state uncertain and blocks further commands until a successful refresh. The web editor and the fixed Maison command share the same settings and revision comparison.

The registry contains **14 distinct spots**, one desktop and one mobile unit for each of seven placements, all created for site **89019**. Activation is rejected when a selected placement lacks a valid complete desktop or mobile entry, or repeats the same identifier for both. The layout breakpoint is 1,024 pixels. After a global SDK starts, crossing that breakpoint triggers one clean reload before another device variant can start; removing its script alone would leave vendor listeners installed.

## HTTP advertising documents

Banners and feed ads load through `/api/ads/embed`, which independently rechecks delivery eligibility. It accepts only known placement/device pairs and returns private, unindexable responses. It never accepts HTML, script URLs or ad identifiers from request parameters.

The iframe uses `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`. Its response uses `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`. This separates layout and content policies; it **does not isolate publisher data from the trusted TrafficStars SDK**. Removing `allow-same-origin` breaks the generated MasterSpot SDK's unguarded cookie/sessionStorage access. No storage or browser API is spoofed to work around that behavior.

The main document keeps exact advertising hosts in `ads-csp.ts`. Only the advertising document permits arbitrary HTTPS creative image/media/frame resources. Its scripts remain restricted to exact vendor hosts and a hash of our fixed bootstrap; connections remain restricted to known vendor endpoints. Unknown creative scripts remain blocked. No general `https:` permission is added to the main document.

## Video Shorts integration decision

The account-generated `https://cdn.fozekikikiminu.com/sdk/v1/dd.video.shorts.js` returned HTTP 404 when preparing the integration. The official `https://cdn.tsyndicate.com/sdk/v1/video.shorts.js` returned HTTP 200 and exposes the required `spot`, `containerId` and `inFeed` API. The integration explicitly uses that official SDK with the site's own desktop/mobile spots. The generated URL/domain remain registry metadata; the standard SDK does not implement the generated `domain` option and uses its canonical TrafficStars VAST endpoint. No alternate auction URL is fabricated.

`inFeed: true` selects the SDK's feed behavior, including hover/touch initiation rather than automatic playback. SDK fingerprint expansion (`autoXu`) is disabled. A feed ad that does not render is removed after a bounded wait; media indexes, IDs and ordering are preserved.

The generated interstitial snippet originally had `countdown: 0` and `cookieExpires: 0.0034722222`. SDK source multiplies the countdown by 1,000 and the cookie duration by 3,600,000: those values would close immediately and expire after about 12.5 seconds. The approved integration deliberately uses a 5-second automatic close and `cookieExpires: 5/60`, meaning five minutes. `countClicks: 3` means a trigger after three eligible clicks, not three impressions per window. Popunder settings remain one display per 300-second session, first delay five seconds, between-display delay 60 seconds, selective mode. Slider uses the generated one-minute click cap and immediate native close availability.

## Verification limit

Preparation tests use local SDK/creative mocks and do not request paid creatives or click ads. Real fill, advertiser media hosts, revenue and final device behavior require observation when the owner later enables delivery. No full replication of another site's anti-adblock routing or revenue is claimed.

SDK sources inspected without executing ad requests:

- https://cdn.fozekikikiminu.com/sdk/v1/dd.ms.js
- https://cdn.tsyndicate.com/sdk/v1/video.shorts.js
- https://cdn.tsyndicate.com/sdk/v1/interstitial.ts.js
- https://cdn.tsyndicate.com/sdk/v1/video.instant.message.js
- https://trafficstars.com/faq/articles/onetag-for-publishers
- https://docs.trafficstars.com/sdk/_video_shorts.md
