# Media repair throughput

The repair coordinator previously treated a network pause as a request to drain
all in-flight jobs before exiting. When a remaining transfer was slow, free
worker slots stayed unused after the shared 60-second deadline had expired.

The coordinator now rechecks the complete deadline while draining. If jobs are
still active when it expires, normal dispatch can resume in free slots. Every
subsequent network failure extends the shared deadline as before, including a
pause created by the photo pool. If all jobs finish before expiry, the service
still exits and its timer handles the next attempt.

The configurable concurrency ceiling is eight workers. The default CLI and
photo pool remain unchanged. Increasing the deployed video count is a separate,
reversible operational action: start with six and measure before considering
eight. More workers can increase throughput only while memory, staging space,
HTTP availability and the public application remain healthy. A worker may hold
up to 2 GiB of temporary video data, so twelve concurrent maximum-size downloads
can consume 24 GiB before reserving space for the rest of the server.

Unchanged safeguards:

- One exclusive coordinator and a separate lock for each repair job.
- At least two seconds between launches, and bounded sessions.
- Shared network cooldowns and one-hour individual content-validation retries.
- Source identity, withdrawal and exclusion checks before publication.
- Complete-file validation and conditional storage writes that preserve existing
  objects.

The regression tests use real child processes with synthetic repair runtimes.
They verify restart after an expired cooldown while a slow child is still
active, another pool extending the pause, a subsequent failure starting a new
cooldown, concurrency limits and the existing shutdown/recovery invariants.

For deployment, use an immutable copy of the current repair release and replace
only the committed coordinator and its tests. Run the worker tests in both
release copies before switching their `current` links. Preserve the previous
links for rollback. A change to video concurrency must preserve the existing
unit and use a dedicated, backed-up drop-in. Restart only the video repair
service; its checkpoint recovers interrupted jobs under the exclusive lock.

Measure completed repair tasks, actual video uploads, poster uploads, retries,
exclusions and remaining jobs separately. Compare complete windows and byte
volume as well as file counts: file-size mix and slow HTTP requests affect the
result. A short post-deployment burst does not establish a sustained hourly
rate or guarantee that every remaining source can be recovered.

## Initial operational experiment

The coordinator patch passed 119 targeted repair, checkpoint and local-cache
tests, plus the repository CI. Both deployed repair copies passed the 19 worker
tests before their release links changed.

The six-worker pilot completed a full five-minute window with 40 completed
repairs and 40 main-video uploads (about 0.58 GB). The first full window at eight
had 39 repairs/uploads (about 0.94 GB), followed by a five-minute window with only
eight and thirteen transport timeouts. File-size mix and upstream variability
prevent attributing every difference to concurrency. The eight-worker setting
was rolled back to six because it did not establish a sustained improvement.
The coordinator patch remains deployed.

The VPS retained CPU, memory and staging capacity during these checks. A
separate read-only diagnostic measured runtime initialization at about 0.47 s
and candidate validation at about 0.04 s, then encountered a connection timeout
on the configured source API/proxy path. The exact failing network hop was not
isolated. The Mac tunnel was established and transferred data, so it was not
restarted without evidence of a fault.

Keep six as the monitored pilot and preserve normal network backoff. Do not
repeat a larger pool merely to increase the displayed worker count. A sustained
1,000 repairs/hour has not been established; further changes need evidence of
the limiting HTTP stage and a comparable measured improvement.
