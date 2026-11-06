from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from ops.megabot_queue import adapter, bootstrap


class BootstrapTest(unittest.TestCase):
    def test_discovery_manifest_is_not_approval(self):
        document = {
            "schemaVersion": 1, "source": "leakgallery", "approvalStatus": "review_required",
            "candidates": [{"handle": "new-one", "aliases": ["old-one"], "identityNeedsVerification": True}],
        }
        with self.assertRaises(bootstrap.BootstrapError):
            bootstrap.approved_candidates(document)
        document["approvalStatus"] = "approved"
        self.assertEqual(bootstrap.approved_candidates(document), {"new-one": ("old-one",)})
        document["candidates"].append({"handle": "other", "aliases": ["old-one"], "identityNeedsVerification": True})
        with self.assertRaises(bootstrap.BootstrapError):
            bootstrap.approved_candidates(document)

    def test_known_hidden_and_alias_rows_are_never_reused(self):
        for handle in ("new-one", "old-one"):
            with self.subTest(handle=handle):
                db = bootstrap.BootstrapDatabase(Mock(), "new-one", ("old-one",))
                with patch.object(db, "rows", return_value=[("other-id", handle, 1, None)]) as read:
                    self.assertEqual(db.inspect(), "known")
                self.assertEqual(read.call_count, 1)
                self.assertNotIn("is_hidden=0", read.call_args.args[0])

    def test_owned_pending_profile_resumes_but_withdrawn_profile_does_not(self):
        db = bootstrap.BootstrapDatabase(Mock(), "new-one", ("old-one",))
        pending = (db.bootstrap_id, "new-one", 1, None, db.bootstrap_id)
        with patch.object(db, "rows", side_effect=[[pending], []]):
            self.assertEqual(db.inspect(), "pending")
        for row in ((db.bootstrap_id, "new-one", 0, None, None),
                    (*pending[:3], "removed", db.bootstrap_id), (*pending[:4], None)):
            with patch.object(db, "rows", return_value=[row]):
                self.assertEqual(db.inspect(), "known")

    def test_reservation_records_quota_in_same_transaction(self):
        original = Mock()
        db = bootstrap.BootstrapDatabase(original, "new-one", ())
        with patch.object(db, "inspect", return_value="new"), patch.object(db, "assert_media_allowed"), \
                patch.object(db, "rows", return_value=1) as write:
            db.reserve()
        self.assertEqual(write.call_count, 3)
        self.assertIn("INSERT INTO creators", write.call_args_list[0].args[0])
        self.assertIn("INSERT INTO creator_import_caps", write.call_args_list[1].args[0])
        self.assertEqual(write.call_args_list[1].args[1], (db.bootstrap_id,))
        self.assertIn("INSERT INTO creator_bootstrap_staging", write.call_args_list[2].args[0])
        original.conn.start_transaction.assert_called_once()
        original.conn.commit.assert_called_once()

    def test_quota_reservation_failure_rolls_back_creator(self):
        original = Mock()
        db = bootstrap.BootstrapDatabase(original, "new-one", ())
        with patch.object(db, "inspect", return_value="new"), patch.object(db, "assert_media_allowed"), \
                patch.object(db, "rows", side_effect=[1, RuntimeError("quota")]):
            with self.assertRaises(RuntimeError):
                db.reserve()
        original.conn.rollback.assert_called_once()
        original.conn.commit.assert_not_called()

    def test_exact_source_identity_is_required(self):
        db = bootstrap.BootstrapDatabase(None, "new-one", ("old-one",))
        db.assert_source_identity({"id": 5, "profile": {"username": "New-One", "old_usernames": "Old-One"}})
        for profile in ({}, {"username": "New-One", "old_usernames": None},
                        {"username": "Old-One", "old_usernames": "New-One"},
                        {"username": "New-One", "old_usernames": "Old-One/other"}):
            with self.subTest(profile=profile), self.assertRaises(adapter.RetryableError):
                db.assert_source_identity({"id": 5, "profile": profile})

    def test_staged_rows_require_registry_match_and_never_exceed_fifteen(self):
        db = bootstrap.BootstrapDatabase(Mock(), "new-one", ())
        staged = [(f"photo-{i}", str(i), 1, None, "video", i, f"photo-{i}") for i in range(1, 16)]
        with patch.object(db, "rows", side_effect=[staged, [(15,)]]):
            self.assertEqual(len(db.staged()), 15)
        for rows in ([*staged, ("photo-16", "16", 1, None, "photo", 16, "photo-16")],
                     [("photo-1", "1", 0, None, "video", 1, "photo-1")],
                     [("photo-1", "1", 1, "removed", "video", 1, "photo-1")],
                     [("photo-1", "1", 1, None, "video", None, "photo-1")],
                     [("photo-1", "1", 1, None, "video", 1, None)]):
            with self.subTest(count=len(rows)), patch.object(db, "rows", return_value=rows):
                with self.assertRaises(bootstrap.BootstrapError):
                    db.staged()

    def test_missing_or_inconsistent_durable_quota_cannot_resume(self):
        db = bootstrap.BootstrapDatabase(Mock(), "new-one", ())
        staged = [("photo-1", "1", 1, None, "video", 1, "photo-1")]
        for cap in ([], [(0,)], [(2,)]):
            with self.subTest(cap=cap), patch.object(db, "rows", side_effect=[staged, cap]):
                with self.assertRaises(bootstrap.BootstrapError):
                    db.staged()

    def test_sixteenth_insert_is_rolled_back_inside_existing_transaction(self):
        original = Mock()
        db = bootstrap.BootstrapDatabase(original, "new-one", ())
        over_cap = [(f"photo-{i}", str(i), 1, None, "video", i, f"photo-{i}") for i in range(1, 17)]
        with patch.object(db, "eligible_id", return_value=db.bootstrap_id), \
                patch.object(db, "rows", side_effect=[1, 1, over_cap]) as rows:
            with self.assertRaises(bootstrap.BootstrapError):
                db.insert_photo("photo-16", db.bootstrap_id, "16")
        original.insert_photo.assert_called_once()
        original.conn.start_transaction.assert_called_once()
        original.conn.rollback.assert_called_once()
        original.conn.commit.assert_not_called()
        self.assertIn("SET is_hidden=1", rows.call_args_list[0].args[0])
        self.assertIn("INSERT INTO creator_bootstrap_staged_media", rows.call_args_list[1].args[0])

    def test_notice_during_activation_rolls_back_all_visibility_changes(self):
        original = Mock()
        db = bootstrap.BootstrapDatabase(original, "new-one", ("old-one",))
        with patch.object(db, "eligible_id", return_value=db.bootstrap_id), \
                patch.object(db, "staged", return_value=[("photo-1", "1"), ("photo-2", "2")]), \
                patch.object(db, "assert_media_allowed", side_effect=[None, None, adapter.MediaExcluded]), \
                patch.object(db, "rows", return_value=1) as rows:
            with self.assertRaises(adapter.MediaExcluded):
                db.activate()
        self.assertEqual(db.notice_handles, ("new-one", "old-one"))
        self.assertEqual(rows.call_count, 1)
        self.assertIn("UPDATE photos", rows.call_args.args[0])
        original.conn.rollback.assert_called_once()
        original.conn.commit.assert_not_called()

    def test_retry_budget_is_derived_from_staged_rows(self):
        db = SimpleNamespace(handle="new-one", inspect=lambda: "pending",
                             reserve=lambda: None, staged=lambda: list(range(14)),
                             activate=lambda: 15)
        with patch.object(bootstrap, "run_profile", return_value={"status": "capped"}) as run:
            result = bootstrap.run_candidate(db, source_path="fixture", state_dir="fixture", apply=True)
        self.assertEqual(result, {"status": "published", "media": 15})
        self.assertEqual(run.call_args.kwargs["max_new"], 1)

    def test_dry_run_and_known_skip_do_not_call_ingestion(self):
        db = SimpleNamespace(handle="new-one", inspect=lambda: "new")
        with patch.object(bootstrap, "run_profile") as run:
            self.assertEqual(bootstrap.run_candidate(db, source_path="fixture", state_dir="fixture"),
                             {"status": "new"})
            db.inspect = lambda: "known"
            self.assertEqual(bootstrap.run_candidate(db, source_path="fixture", state_dir="fixture", apply=True),
                             {"status": "known"})
        run.assert_not_called()

    def test_approved_entries_are_sequential_and_retry_stops_the_batch(self):
        candidates = {"first": (), "second": (), "third": ()}
        config = {"source_path": "fixture", "state_dir": "fixture"}
        with patch.object(bootstrap, "run_candidate", side_effect=[
            {"status": "published", "media": 15}, adapter.RetryableError("http_429"),
        ]) as run:
            with self.assertRaises(adapter.RetryableError):
                bootstrap.run_approved(Mock(), candidates, {}, config, apply=True)
        self.assertEqual([call.args[0].handle for call in run.call_args_list], ["first", "second"])

    def test_terminal_exclusion_and_identity_review_clear_stage_but_network_retry_does_not(self):
        candidates = {"first": ()}
        config = {"source_path": "fixture", "state_dir": "fixture"}
        for error, clear in ((adapter.MediaExcluded("notice_excluded"), True),
                             (adapter.RetryableError("bootstrap_identity_changed"), True),
                             (adapter.RetryableError("http_429"), False)):
            with self.subTest(error=error), patch.object(bootstrap, "run_candidate", side_effect=error), \
                    patch.object(bootstrap.BootstrapDatabase, "abort") as abort:
                if isinstance(error, adapter.MediaExcluded):
                    self.assertEqual(bootstrap.run_approved(Mock(), candidates, {}, config, apply=True),
                                     {"status": "completed", "counts": {"excluded": 1, "media": 0}})
                else:
                    with self.assertRaises(adapter.RetryableError):
                        bootstrap.run_approved(Mock(), candidates, {}, config, apply=True)
                self.assertEqual(abort.call_count, int(clear))

    def test_existing_queue_pause_prevents_reserving_or_ingesting(self):
        for kind, error in (("network", adapter.RetryableError), ("storage", adapter.StorageFull)):
            db = Mock()
            db.inspect.return_value = "new"
            with self.subTest(kind=kind), patch.object(bootstrap, "queue_status", return_value={
                "pause_kind": kind, "pause_until": bootstrap.time.time() + 60,
            }), patch.object(bootstrap, "run_profile") as run:
                with self.assertRaises(error):
                    bootstrap.run_candidate(db, source_path="fixture", state_dir="fixture", apply=True)
            db.reserve.assert_not_called()
            run.assert_not_called()

    def test_staging_space_reserves_five_downloads_and_headroom(self):
        with patch.object(bootstrap.shutil, "disk_usage", return_value=SimpleNamespace(free=12 * 1024**3 - 1)):
            with self.assertRaises(adapter.StorageFull):
                bootstrap.check_staging_space("fixture")
        with patch.object(bootstrap.shutil, "disk_usage", return_value=SimpleNamespace(free=12 * 1024**3)):
            bootstrap.check_staging_space("fixture")
