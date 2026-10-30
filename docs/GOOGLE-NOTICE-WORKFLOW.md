# Google notice listener removed

The new Google-notice listener was removed on 2026-10-30 at the owner's request.
Its policy module, tests and database-test helper are no longer deployed or
included in the current source tree. The previous listener source and tests were
restored byte-for-byte from the pre-deployment VPS backup for preservation.

The old listener's timer and service are stopped; do not restart its automatic
URL-rotation workflow. The existing `dmca_reimport.py` file and its timer were not
changed. Its previously diagnosed API-decoding defect remains unresolved.

The new listener's files were moved to a recoverable backup under
`/opt/photo/backups/removed-google-notice-listener-20261030T171019Z`.
The mailbox UID cursor, event journal, media and website visibility fixes were
preserved. No historical notice was replayed and no content was republished by
this removal.
