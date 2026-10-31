import unittest

from dmca_metadata_repair import (
    ManifestRepair,
    collect_targets,
    result_exit_code,
    should_commit,
)


class FakeCursor:
    def __init__(self, catalog_by_source, source_ids_by_handle):
        self.catalog_by_source = catalog_by_source
        self.source_ids_by_handle = source_ids_by_handle
        self._rows = []
        self.updates = []
        self.queries = []

    def execute(self, query, params=()):
        normalized = " ".join(query.split())
        self.queries.append((normalized, tuple(params)))
        if normalized.startswith("SELECT source_id FROM bot_ingested"):
            self._rows = [(source_id,) for source_id in self.source_ids_by_handle.get(params[0], [])]
        elif "FROM bot_ingested b" in normalized:
            row = self.catalog_by_source.get((int(params[0]), params[1]))
            self._rows = [row] if row else []
        elif normalized.startswith("UPDATE photos SET source_id"):
            self.updates.append(tuple(params))
            self._rows = []
        else:
            raise AssertionError(f"unexpected query: {normalized}")

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class MetadataRepairTest(unittest.TestCase):
    def test_catalog_mapping_separates_a_versioned_public_id_without_querying_photos_by_source_id(self):
        cursor = FakeCursor(
            catalog_by_source={
                (7006919, "kenalialuv"): (
                    7006919,
                    "kenalialuv",
                    "photo-1",
                    "kenalialuv",
                    "7006919-v21",
                    1,
                    None,
                    None,
                )
            },
            source_ids_by_handle={"kenalialuv": [7006919]},
        )

        result = ManifestRepair(cursor).run(
            set(), {("kenalialuv", "7006919", 21)}, dry_run=False
        )

        self.assertEqual({"checked": 1, "updated": 1}, dict(result))
        self.assertEqual([("7006919", 21, "photo-1")], cursor.updates)
        self.assertTrue(all("WHERE p.source_id" not in query for query, _ in cursor.queries))

    def test_dry_run_reports_the_update_without_writing(self):
        cursor = FakeCursor(
            catalog_by_source={
                (42, "alice"): (42, "alice", "photo-42", "alice", "42-v2", 1, None, None)
            },
            source_ids_by_handle={},
        )

        result = ManifestRepair(cursor).run(
            set(), {("alice", "42", 2)}, dry_run=True
        )

        self.assertEqual({"checked": 1, "would_update": 1}, dict(result))
        self.assertEqual([], cursor.updates)

    def test_missing_or_wrong_creator_rows_are_left_unchanged(self):
        cursor = FakeCursor(
            catalog_by_source={
                (8, "alice"): (8, "alice", "photo-8", "other", "8", 1, None, None)
            },
            source_ids_by_handle={},
        )

        result = ManifestRepair(cursor).run(
            set(), {("alice", "7", None), ("alice", "8", None)}, dry_run=False
        )

        self.assertEqual(
            {"checked": 2, "unresolved": 1, "creator_mismatch": 1}, dict(result)
        )
        self.assertEqual([], cursor.updates)

    def test_manifest_suffix_does_not_downgrade_an_existing_canonical_version(self):
        cursor = FakeCursor(
            catalog_by_source={
                (9, "alice"): (9, "alice", "photo-9", "alice", "9", 23, None, None)
            },
            source_ids_by_handle={},
        )

        result = ManifestRepair(cursor).run(
            set(), {("alice", "9", 2)}, dry_run=False
        )

        self.assertEqual({"checked": 1, "already_indexed": 1}, dict(result))
        self.assertEqual([], cursor.updates)

    def test_manifest_enumerates_only_missing_creators_without_explicit_ids(self):
        full_handles, explicit, conflicts = collect_targets(
            {
                "creators_manquantes": {
                    "Alice": {"photo_ids": [1, "2", "bad"]},
                    "Bob": {},
                },
                "medias_manquants_sur_creatrices_existantes": {"Carol": ["3-v4"]},
            }
        )

        self.assertEqual({"bob"}, full_handles)
        self.assertEqual(
            {("alice", "1", None), ("alice", "2", None), ("carol", "3", 4)},
            explicit,
        )
        self.assertEqual({}, conflicts)

    def test_manifest_detects_conflicting_versions_for_one_media(self):
        _, explicit, conflicts = collect_targets(
            {
                "creators_manquantes": {},
                "medias_manquants_sur_creatrices_existantes": {
                    "alice": ["42-v2", "42-v7"]
                },
            }
        )

        self.assertEqual(set(), explicit)
        self.assertEqual({("alice", "42"): (2, 7)}, conflicts)

    def test_version_conflict_is_reported_without_an_update(self):
        cursor = FakeCursor(
            catalog_by_source={
                (42, "alice"): (42, "alice", "photo-42", "alice", "42", 1, None, None)
            },
            source_ids_by_handle={},
        )

        result = ManifestRepair(cursor).run(
            set(), set(), conflicts={("alice", "42"): (2, 7)}, dry_run=False
        )

        self.assertEqual({"checked": 1, "version_conflict": 1}, dict(result))
        self.assertEqual([], cursor.updates)

    def test_unresolved_targets_produce_a_degraded_exit_status(self):
        self.assertEqual(0, result_exit_code({"checked": 1, "already_indexed": 1}))
        self.assertEqual(2, result_exit_code({"checked": 2, "unresolved": 1}))
        self.assertEqual(2, result_exit_code({"checked": 1, "version_conflict": 1}))

    def test_successful_repairs_commit_even_if_other_targets_are_unresolved(self):
        self.assertTrue(should_commit({"checked": 1, "updated": 1}, dry_run=False))
        self.assertFalse(should_commit({"checked": 1, "would_update": 1}, dry_run=True))
        self.assertTrue(should_commit({"checked": 2, "updated": 1, "unresolved": 1}, dry_run=False))


if __name__ == "__main__":
    unittest.main()
