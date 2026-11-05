import json
from pathlib import Path
import stat
import tempfile
import unittest

from ops.megabot_queue.discovery import DiscoveryError, SourceCatalogue, discover, write_manifest


def card(username, **extra):
    return {"username": username, "added": "fixture", "banner_pic": "private-url",
            "profile_pic": "private-url", **extra}


def profile(username, media_id, aliases=None, **flags):
    return {
        f"/profile/{username}/1": {"page": 1, "medias": [{"id": media_id, "is_video": False}]},
        f"/media/{media_id}": {"id": media_id, "profile": {
            "username": username, "old_usernames": aliases, "profile_pic": "private-url", **flags,
        }},
    }


class DiscoveryTests(unittest.TestCase):
    def test_known_current_and_historical_handles_are_excluded(self):
        payloads = {
            "/popular/newest-profiles/1": [card("Current"), card("Historic"), card("Renamed"), card("New"), card("New")],
            **profile("Renamed", 1, "Historic / Older"),
            **profile("New", 2, ["previous"]),
        }
        requested = []

        def fetch(path, **_kwargs):
            requested.append(path)
            return payloads[path]

        manifest = discover(fetch, {"current", "historic"}, [], pages=1, profile_limit=4)
        self.assertEqual(manifest["approvalStatus"], "review_required")
        self.assertEqual(manifest["candidates"], [
            {"handle": "new", "aliases": ["previous"], "identityNeedsVerification": True},
        ])
        self.assertEqual(requested, [
            "/popular/newest-profiles/1", "/profile/Renamed/1", "/media/1", "/profile/New/1", "/media/2",
        ])
        self.assertNotIn("private-url", json.dumps(manifest))

    def test_ambiguous_authors_removed_profiles_and_withdrawn_aliases_are_excluded(self):
        names = ["First", "Second", "Wrong", "Hidden", "Withdrawn", "Malformed", "WrongId"]
        payloads = {
            "/popular/newest-profiles/1": [card(name) for name in names],
            **profile("First", 1, "shared"), **profile("Second", 2, ["shared"]),
            **profile("Wrong", 3), **profile("Hidden", 4, None, is_hidden=True),
            **profile("Withdrawn", 5, "old-alias"), **profile("Malformed", 6, ["safe", 7]),
            **profile("WrongId", 7),
        }
        payloads["/media/3"]["profile"]["username"] = "Unrelated"
        payloads["/media/7"]["id"] = 8
        notices = [{"urls": "https://leakfanhub.com/fr/old-alias"}]
        manifest = discover(lambda path, **_: payloads[path], set(), notices, pages=1, profile_limit=10)
        self.assertEqual(manifest["candidates"], [])

    def test_explicit_limits_bound_directory_and_metadata_calls(self):
        paths = []
        payloads = {"/popular/newest-profiles/1": [card("First"), card("Second")], **profile("First", 1)}

        def fetch(path, **_kwargs):
            paths.append(path)
            return payloads[path]

        manifest = discover(fetch, set(), [], pages=1, profile_limit=1)
        self.assertEqual(len(manifest["candidates"]), 1)
        self.assertEqual(paths, ["/popular/newest-profiles/1", "/profile/First/1", "/media/1"])
        for pages, profile_limit in [(0, 1), (6, 1), (1, 0), (1, 21)]:
            with self.subTest(pages=pages, profile_limit=profile_limit), self.assertRaises(DiscoveryError):
                discover(fetch, set(), [], pages=pages, profile_limit=profile_limit)
        self.assertEqual(len(paths), 3)

    def test_an_alias_claiming_another_cards_canonical_handle_excludes_both(self):
        payloads = {"/popular/newest-profiles/1": [card("First"), card("Second")],
                    **profile("First", 1, "Second"), **profile("Second", 2)}
        manifest = discover(lambda path, **_: payloads[path], set(), [], pages=1, profile_limit=2)
        self.assertEqual(manifest["candidates"], [])

    def test_invalid_directory_shape_is_a_failure(self):
        with self.assertRaisesRegex(DiscoveryError, "invalid_catalogue"):
            discover(lambda *_args: {"profiles": []}, set(), [], pages=1, profile_limit=1)

    def test_source_uses_configured_proxy_without_redirect_and_throttles(self):
        class Response:
            status_code = 200
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def iter_content(self, **_kwargs): return iter([b"[]"])

        calls = []
        pauses = []

        class Session:
            def get(self, url, **kwargs):
                calls.append((url, kwargs))
                return Response()

        source = SourceCatalogue(Session(), "https://api.leakgallery.com", ["configured-proxy"], sleep=pauses.append)
        self.assertEqual(source.fetch("/popular/newest-profiles/1"), [])
        self.assertEqual(source.fetch("/popular/newest-profiles/2"), [])
        self.assertEqual(pauses, [2])
        self.assertTrue(all(call[1]["allow_redirects"] is False for call in calls))
        self.assertTrue(all(call[1]["proxies"]["https"] == "configured-proxy" for call in calls))
        with self.assertRaisesRegex(DiscoveryError, "invalid_source_origin"):
            SourceCatalogue(Session(), "https://unexpected.test", [])

    def test_manifest_is_private_and_existing_destination_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            parent = Path(directory)
            destination = parent / "candidates.json"
            write_manifest(destination, {"candidates": []})
            self.assertEqual(stat.S_IMODE(destination.stat().st_mode), 0o600)
            with self.assertRaises(FileExistsError):
                write_manifest(destination, {"candidates": ["other"]})
            self.assertEqual(json.loads(destination.read_text()), {"candidates": []})
            parent.chmod(0o755)
            with self.assertRaisesRegex(DiscoveryError, "manifest_directory_not_private"):
                write_manifest(parent / "other.json", {"candidates": []})
