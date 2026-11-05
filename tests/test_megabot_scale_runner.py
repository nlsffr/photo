import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from ops.megabot_queue.adapter import RetryableError, StorageFull
from ops.megabot_queue.discovery import DiscoveryError
from ops.megabot_queue.scale_runner import PendingQueue, read_seed_preview, run_cycle


def card(name):
    return {"username": name, "added": "", "banner_pic": "", "profile_pic": ""}


def fixtures(*names):
    responses = {"/popular/newest-profiles/1": [card(name) for name in names]}
    for media_id, name in enumerate(names, start=1):
        responses[f"/profile/{name}/1"] = {"page": 1, "medias": [{"id": media_id}]}
        responses[f"/media/{media_id}"] = {"id": media_id, "profile": {
            "username": name, "old_usernames": None,
        }}
    return responses


def published():
    return {"status": "completed", "counts": {"published": 1, "media": 3}}


class ScaleRunnerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "pending.sqlite3"
        self.now = 10_000

    def cycle(self, queue, responses, import_one, **kwargs):
        return run_cycle(queue, lambda path, **_: responses[path], lambda: (set(), []), import_one,
                         pages=1, profile_limit=kwargs.pop("profile_limit", 3),
                         imports_per_cycle=kwargs.pop("imports_per_cycle", 2),
                         now=lambda: self.now, **kwargs)

    def test_queue_commits_before_import_and_restarts_with_retry_instead_of_starving(self):
        responses = fixtures("first", "second", "third")
        attempts = []

        def import_one(handle, _aliases):
            attempts.append(handle)
            # A second connection sees the queue even before the importer returns.
            with sqlite3.connect(self.path) as connection:
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM candidates").fetchone()[0], 3)
            if handle == "first":
                raise RetryableError("media_lock_busy")
            return published()

        with PendingQueue(self.path) as queue:
            result = self.cycle(queue, responses, import_one)
        self.assertEqual(attempts, ["first", "second"])
        self.assertEqual(result["counts"]["published"], 1)
        self.assertEqual(result["counts"]["retry"], 1)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

        with PendingQueue(self.path) as queue:
            attempts.clear()
            self.cycle(queue, {"/popular/newest-profiles/1": responses["/popular/newest-profiles/1"]}, import_one)
            self.assertEqual(attempts, ["third"])
            self.now += 3601
            attempts.clear()
            self.cycle(queue, {"/popular/newest-profiles/1": []}, lambda handle, _: attempts.append(handle) or published())
            self.assertEqual(attempts, ["first"])

    def test_ambiguous_metadata_is_deferred_so_the_next_scan_advances(self):
        responses = fixtures("unverified", "later")
        responses["/media/1"]["profile"]["username"] = "someone-else"
        imported = []
        with PendingQueue(self.path) as queue:
            self.cycle(queue, responses, lambda handle, _: imported.append(handle) or published(), profile_limit=1)
            self.now += 120
            self.cycle(queue, responses, lambda handle, _: imported.append(handle) or published(), profile_limit=1)
        self.assertEqual(imported, ["later"])

    def test_catalogue_cooldown_survives_restart_and_leaves_ready_imports_running(self):
        def scan(path, **_):
            self.assertEqual(path, "/popular/newest-profiles/1")
            self.now += 45
            return []

        with PendingQueue(self.path) as queue:
            run_cycle(queue, scan, lambda: (set(), []), lambda *_: self.fail("empty catalogue"),
                      pages=1, profile_limit=1, imports_per_cycle=2, now=lambda: self.now)

        with PendingQueue(self.path) as queue:
            self.now += 30
            attempted = []
            self.cycle(queue, {}, lambda handle, _: attempted.append(handle) or published(),
                       seeds={"ready": ()})
            self.assertEqual(attempted, ["ready"])
            self.now += 89
            self.cycle(queue, {}, lambda *_: self.fail("no ready candidates"))
            self.now += 1
            report = self.cycle(queue, fixtures("next"), lambda *_: published())
            self.assertEqual(report["counts"]["published"], 1)

    def test_storage_failure_keeps_remaining_candidates_and_stops_cycle(self):
        attempted = []

        def stopped(handle, _aliases):
            attempted.append(handle)
            raise StorageFull("staging_space_low")

        with PendingQueue(self.path) as queue:
            result = self.cycle(queue, fixtures("first", "second"), stopped)
            self.assertEqual(result["status"], "storage_full")
            self.assertEqual(attempted, ["first"])
            self.assertEqual(queue.skip_for_discovery(self.now), {"first", "second"})

    def test_long_failure_waits_from_its_end_before_retry(self):
        def slow_failure(_handle, _aliases):
            self.now += 180
            raise RetryableError("media_lock_busy")

        with PendingQueue(self.path) as queue:
            self.cycle(queue, fixtures("first"), slow_failure)
            early_attempts = []
            self.cycle(queue, {"/popular/newest-profiles/1": []},
                       lambda handle, _: early_attempts.append(handle) or published())
            self.assertEqual(early_attempts, [])
            self.now += 61
            attempts = []
            self.cycle(queue, {"/popular/newest-profiles/1": []},
                       lambda handle, _: attempts.append(handle) or published())
            self.assertEqual(attempts, ["first"])

    def test_source_failure_preserves_seed_and_obeys_durable_cooldown(self):
        def throttled(*_args, **_kwargs):
            raise DiscoveryError("source_http_429")

        with PendingQueue(self.path) as queue:
            report = run_cycle(queue, throttled, lambda: (set(), []), lambda *_: self.fail("must pause"),
                               pages=1, profile_limit=1, imports_per_cycle=2, now=lambda: self.now,
                               seeds={"seed": ("older",)})
            self.assertEqual(report["status"], "source_deferred")
        with PendingQueue(self.path) as queue:
            self.assertEqual(queue.skip_for_discovery(self.now), {"seed", "older"})
            report = self.cycle(queue, {}, lambda *_: self.fail("must pause"))
            self.assertEqual(report["status"], "source_cooldown")

    def test_ready_seed_fills_batch_without_catalogue_requests(self):
        attempts = []
        with PendingQueue(self.path) as queue:
            report = self.cycle(queue, {}, lambda handle, _: attempts.append(handle) or published(),
                                seeds={"one": (), "two": (), "three": ()})
            self.assertEqual(attempts, ["one", "two"])
            self.assertEqual(report["status"], "completed")
            self.assertEqual(report["counts"]["pending"], 1)

    def test_alias_collisions_never_admit_a_second_candidate(self):
        with PendingQueue(self.path) as queue:
            self.assertEqual(queue.admit({"first": ("old",)}, self.now), 1)
            self.assertEqual(queue.admit({"second": ("old",), "old": ()}, self.now), 0)

    def test_private_seed_preserves_exact_selected_entries_and_rejects_public_file(self):
        preview = Path(self.directory.name) / "preview.json"
        preview.write_text(json.dumps({
            "schemaVersion": 1, "source": "leakgallery", "approvalStatus": "review_required",
            "candidates": [
                {"handle": "first", "aliases": [], "identityNeedsVerification": True},
                {"handle": "second", "aliases": ["prior"], "identityNeedsVerification": True},
                {"handle": "third", "aliases": [], "identityNeedsVerification": True},
            ],
        }))
        preview.chmod(0o600)
        self.assertEqual(read_seed_preview(preview, [2, 3]), {"second": ("prior",), "third": ()})
        preview.chmod(0o644)
        with self.assertRaises(ValueError):
            read_seed_preview(preview, [2])
