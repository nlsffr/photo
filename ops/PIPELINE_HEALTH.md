# Private pipeline health contract, version 1

The existing authenticated Unix socket `status` response (and Maison `/api/bots`)
adds `pipelineHealth`. Existing bot identifiers, commands, peer authentication,
source workers and queue state files are unchanged. No photos database query,
source API request, storage listing or new network connection is performed.

## Bot state and commands

Managed bots add `enabled: boolean` and `workerState`. A verified live worker has
`state: "running"`, `workerState: "running"`, and `activity: "unknown"`: a PID alone
does not prove ingestion. With no worker, an enabled slot is `paused` during a
network/storage/database pause and `waiting` otherwise; a disabled slot is
`stopped`. Its `activity` and `workerState` use that same value. The legacy handover
preserves its existing process observations; unknown worker state can be null.

Actions remain based on slot enablement: an enabled slot offers `stop`; a disabled
slot with a draining worker offers no command until exit, then offers `start`.
Failure/terminal queue phases are observable through health without widening the
existing mutation gate. An unavailable managed queue still fails closed.

## JSON shape

```json
{
  "pipelineHealth": {
    "version": 1,
    "observedAt": "2026-11-02T10:56:02Z",
    "stale": false,
    "errors": [],
    "queue": {
      "phase": "running",
      "enabledSlots": 4,
      "activeWorkers": 4,
      "proxyAvailable": true,
      "proxyScope": "loopback_listener",
      "pauseKind": null,
      "pauseUntil": null,
      "observedAt": "2026-11-02T10:56:01Z",
      "stale": false,
      "errors": []
    },
    "repairs": {
      "video": {
        "state": "available",
        "restoredRows": 5722,
        "videoFilesRestored": 5331,
        "posterOnlyRestored": 391,
        "alreadyPresent": 1,
        "pending": 70122,
        "running": 0,
        "retry": 69,
        "excluded": 1032,
        "lastRestoredAt": "2026-11-02T02:28:06Z",
        "observedAt": "2026-11-02T10:56:02Z",
        "progressObservedAt": "2026-11-02T10:56:01Z",
        "phase": "running",
        "pauseUntil": null,
        "stale": false,
        "errors": []
      },
      "photo": {
        "state": "unavailable",
        "restoredRows": null,
        "alreadyPresent": null,
        "pending": null,
        "running": null,
        "retry": null,
        "excluded": null,
        "lastRestoredAt": null,
        "observedAt": null,
        "progressObservedAt": null,
        "phase": null,
        "pauseUntil": null,
        "stale": true,
        "errors": ["repair_snapshot_unavailable"]
      }
    }
  }
}
```

The numbers above illustrate the shape; they are not live counters. Counts are
integers or null, never a fabricated zero. A successful complete SQLite aggregate
may legitimately return zero. `pipelineHealth` itself can be null if its collector
unexpectedly fails, while the original bot/control response remains usable.

## Meaning and freshness

- `queue.observedAt` is the producer timestamp; its supervisor and worker PIDs
  are verified through `/proc`. Data older than 30 seconds is unavailable, with
  nullable phase/counts and `stale: true`. `activeWorkers` counts verified live
  workers, even while a global pause lets existing work drain. `enabledSlots`
  counts control flags, not workers. Queue profiles completed are not media
  imported; no last-global-ingestion timestamp is invented.
- `proxyAvailable` means **all configured SOCKS endpoints have an exact IPv4
  loopback LISTEN entry**. Display “Proxy local”. It does not prove SOCKS
  authentication, source API access or a successful import. Unsupported routes,
  missing config or unreadable `/proc` return null; no listener returns false.
  Addresses, proxy credentials and configuration are never returned.
- Repair `state: available` means its counters were readable, not that a repair
  process is alive. `observedAt` is the SQLite aggregation time, cached at most
  ten seconds. Read failure retains the last good counters with their original
  timestamp, `state: stale`, and `stale: true`; no previous observation gives
  unavailable/null counters. Top-level `stale` includes either unavailable queue
  or stale/unavailable repair counters. Consumers should also expire old API
  responses locally rather than retaining a healthy display indefinitely.
- `progressObservedAt` is the mtime of `progress.json`, distinct from count
  observation time and last success. Progress older than 90 seconds or over five
  seconds in the future produces null phase/pause and `repair_progress_stale`.
- `restoredRows` counts jobs finalized as restored, excluding `alreadyPresent`.
  `videoFilesRestored` intersects finalized IDs with `video_uploaded` journal IDs.
  `posterOnlyRestored` intersects finalized IDs without a video upload with
  `poster_uploaded` IDs. An upload without finalization is excluded. These counts
  do not prove full playback of every object. Photo rows include classification
  repair; they are not a count of newly discovered visitors or videos.
- `lastRestoredAt` is the latest restored event, not the latest import. Unknown
  or incomplete journal observations return null. `pending`, `retry`, `excluded`
  describe candidates; they are not an exhaustive count of broken public files.
- All error values are fixed local codes. No IDs, creators, object keys, paths,
  URLs, credentials or raw exception strings are included.

## Bounded observation and release

The collector runs once per controller status request. Each repair SQLite is
opened with `mode=ro`, query-only and a read transaction, 100 ms busy timeout and
a 500 ms instruction deadline. Files must be private regular files owned by the
controller account. Checkpoints above 256 MiB are rejected.

JSON progress/config is capped at 64 KiB. Journals are indexed incrementally by
inode/offset, capped at 32 MiB per file, 8 MiB per poll, 64 KiB per line and 250,000
indexed IDs. Partial/index-limited journal observations leave only the affected
fields null. Rotation/truncation restarts the bounded index. Nothing is written
to repair state and no worker runtime/Queue/State constructor is imported.

Deploy `maison_controller.py`, `dashboard.py` and `health.py` together from a clean,
isolated controller export. Helpers are verified to belong to that controller's
release. Keep the existing queue installation markers and worker symlink intact.
Only the controller service needs a restart; do not restart workers or repair
timers for this display-only change. Restore the previous controller executable
and helper release to roll back; data, control flags and worker identities persist.
