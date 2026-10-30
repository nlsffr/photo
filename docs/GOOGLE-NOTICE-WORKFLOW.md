# Google notice handling

The listener processes new Google email every five minutes using the existing
Gmail account and timer. It verifies the sender and Gmail's first DKIM/DMARC
authentication result, then applies only the copyright-removal template actually
observed in the mailbox (French WNC-594600).

An authenticated removal hides the uniquely matched existing creator or media,
sets `removed_from_index_at`, and records the decision and previous state in
`dmca_mail_events` in the same transaction. Matching includes locale prefixes and
versioned page paths; ambiguous handles and unmatched/assets URLs require review.
No media is deleted, URL version changed, download started, or Google submission
sent. The application excludes hidden records from public access and sitemaps;
the existing media guard also blocks their underlying public asset paths.

Unknown decisions and reinstatement messages require review. Search Console
technical validation is not a reinstatement decision. Of the 744 Google emails
examined on 2026-10-30, 709 were removal notices and none confirmed reinstatement.
There is therefore no automatic approval/republication branch. A future verified
reinstatement workflow must correlate the exact affected URL and case, account
for independent outstanding removals, and use the canonical URL.

## Deployment and rollback

Back up the existing listener, tests, media-guard script, UID cursor and generated
nginx map before replacing files. Preserve the existing numeric UID cursor. Bind
it once to its selected mailbox and UIDVALIDITY with:

```sh
python3 /opt/photo/dmca/dmca_listener.py --bind-mailbox
python3 /opt/photo/dmca/dmca_listener.py --dry-run
```

Load the existing listener environment without printing credentials. Missing or
changed mailbox identity stops processing instead of replaying history. A dry
run never changes the cursor, schema or content. `--dry-run --since-uid N` can
preview a bounded historical batch of up to 200 emails. Normal operation never
replays historical notices after deployment.

The website requires a new application image; keep the prior healthy container
as rollback. Replace the standalone media guard and run its existing systemd
service to activate its map. No application schema migration is needed.

Check `dmca_mail_events` for `outcome='review'` and `unresolved_urls`. Review events
stay recorded even after the mailbox cursor advances. Repeated raw emails are
deduplicated; database failure prevents cursor advancement.

The old `dmca_reimport.py` is **not** this listener and is unchanged by this
release. Its API-decoding bug remains; its old removal-derived work list is not
an approved restoration queue. Do not enable it to republish removed content.
The listener and ingestion timers have not been disabled or removed.

Rollback application/guard code from their saved copies if necessary. Preserve
the event journal and mailbox state: rolling them backwards would replay email.
Do not restore the former automatic URL-rotation listener. Reinstating an actual
publication state needs a separate, verified decision; code rollback alone must
not unhide content.

## Verification

```sh
python3 -m unittest discover -s dmca -v
node --experimental-strip-types --test tests/hidden-visibility.test.ts tests/removed-media-map.test.ts
python3 ops/test-google-notice-db.py
```

The last command creates and drops its own randomly named `notice_test_*`
database and never changes production content. It verifies real MariaDB
transaction rollback, ownership matching and unchanged URL versions.
