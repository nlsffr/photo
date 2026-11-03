# Repair client reuse

The initial concurrency experiment is recorded in
`REPAIR-THROUGHPUT-2026-11-03.md`. Six workers remain the operational pilot; the
eight-worker trial was reverted after increased transport timeouts.

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
