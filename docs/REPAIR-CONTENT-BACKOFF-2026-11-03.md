# Repair retries after media validation failure

The parallel media repair coordinator used to treat every retryable error as a
source-wide network failure. A single image with an unsupported signature or a
video that failed probing could therefore repeatedly pause both repair queues.

Only `invalid_video` and `download_signature_rejected` now receive a one-hour
delay on their own job. They retain their `retry` state and original reason;
they are neither marked restored nor permanently skipped. Other jobs can
continue, including jobs in the other media pool.

Network failures, HTTP 429/5xx responses, worker failures and unknown errors keep
the existing shared backoff. Existing source pauses, dispatch spacing, worker
limits, locks, withdrawal checks and media validation remain enforced. No
checkpoint schema or application database migration is required.

Regression coverage uses real child processes and durable SQLite checkpoints to
verify isolated retries, persistence across sessions, eventual retry, successful
work in another pool, and preservation of source-wide network pauses.

Deployment replaces only the coordinator and its tests in copies of the
previous immutable repair releases. Switching the two `current` links affects
future coordinator runs; active runs finish naturally. Rollback restores the
previous links without reverting checkpoints or deleting media. No application
build, service restart, infrastructure credential change, or media deletion is
part of this correction.
