# Repair client reuse

The initial concurrency experiment is recorded in
`REPAIR-THROUGHPUT-2026-11-03.md`. Its eight-worker trial was reverted after
increased transport timeouts. The subsequent client-reuse release received a
separate eight-worker pilot, described below.

A subsequent read-only measurement over the existing proxy found a reusable
HTTP connection: two successful source metadata responses, fifteen seconds
apart, used the same socket. The server advertised a 60-second keep-alive.
Header latency was approximately 2.71 seconds for the first request and 0.40
seconds for the second. Candidate validation took approximately 0.04 seconds in
separate measurements. These small samples support testing transport reuse;
they do not establish a sustained library repair rate.

The coordinator can retain a repair runtime inside its owning child process
across successful jobs. Each child receives one claimed job at a time over its
private pipe and returns an identified result. Only the parent reads/writes the
durable checkpoint. Idle workers remain part of the managed pool and must be
reaped before releasing the coordinator lock.

Reuse is conditional on a runtime hook. The video runtime checks its current
configuration and pinned source integrity before reuse. A runtime without that
hook is reconstructed for each job. Any error closes and resets the runtime;
normal shutdown also closes its HTTP, database and storage clients. No client,
socket or database connection is shared between worker processes.

Transport reuse does not cache permission or media metadata. Every job still
executes the existing candidate, source identity, withdrawal, validation,
conditional upload and post-upload checks. The two-second launch spacing,
shared network cooldowns, per-file one-hour validation retry and eight-worker
maximum remain in effect.

Release validation must cover mismatched pipe results, busy/idle worker death,
maximum concurrency, repeat jobs, pool shutdown including idle children,
cooldown extensions and configuration/source changes. Activation and rollback
use immutable copies of the preceding repair release; only the committed
runtime, coordinator and tests are replaced. The website application and
existing media are not rebuilt or replaced by this deployment.

Before activation, 138 targeted tests passed locally: 86 repair/coordinator
tests, 36 checkpoint/backfill tests and 16 local-cache tests. The worker subset
includes 29 tests, independently reviewed, with process affinity, busy/idle
shutdown, failure/reset and claim-protocol coverage.

## Activation and measured pilot

Both immutable repair copies were activated at 22:37:43 UTC on November 3.
The video service loaded the client-reuse code with six workers at 22:38:55
UTC. The website application was not rebuilt or restarted. Both Linux repair
test suites and CI run 41732149793 passed.

An independently reviewed, reversible service drop-in then changed only video
concurrency from six to eight. The new process was confirmed at 22:50:33 UTC;
the timer remained active. The base unit and all existing source, validation,
withdrawal and retry settings were preserved. Twelve workers were not enabled:
their maximum simultaneous staging demand would exceed the available space
after reserving capacity for the website and existing workloads.

The complete ten-minute window ending 23:00:54 UTC recorded **95 principal
video files uploaded, 2,238,719,531 bytes, and one transport timeout**. Posters
were counted separately. The two disjoint five-minute segments were:

| Segment | Principal files | Bytes | Transport retries |
| --- | ---: | ---: | ---: |
| Earlier five minutes | 76 | 1,840,780,101 | 1 |
| Later five minutes | 19 | 397,939,430 | 0 |

The journal covered both segments in full. The home page, robots file and
sitemap returned HTTP 200; the home probe took approximately 0.43 seconds.
Approximately 3.8 GB of memory and 23.8 GB of staging space remained available.

Eight workers were retained provisionally with the existing 30-minute monitor.
The observed cadence remains uneven. Different cohorts contain different file
sizes and source conditions, so these samples do not isolate a causal speedup
or establish 1,000 repairs per hour. Longer covered windows must confirm the
useful throughput and stability; the prior six-worker configuration remains
available for rollback. Neither an empty task queue nor a successful service
exit proves that the whole library is available.
