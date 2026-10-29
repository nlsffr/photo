import importlib.util
import pathlib
import unittest


SCRIPT = pathlib.Path(__file__).with_name("search-console-report.py")


def load_module():
    spec = importlib.util.spec_from_file_location("search_console_report", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load Search Console report module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeClient:
    def __init__(self):
        self.inspected = []
        self.submitted = []

    def list_sites(self):
        return {
            "siteEntry": [
                {"siteUrl": "sc-domain:leakfanhub.com", "permissionLevel": "siteOwner"},
                {"siteUrl": "https://example.com/", "permissionLevel": "siteRestrictedUser"},
            ],
            "access_token": "must-never-leak",
        }

    def query_performance(self, site_url, payload):
        return {
            "rows": [{"keys": ["2026-10-28"], "clicks": 12, "impressions": 99}],
            "private_key": "must-never-leak",
        }

    def inspect_url(self, site_url, inspection_url):
        self.inspected.append((site_url, inspection_url))
        return {
            "inspectionResult": {
                "indexStatusResult": {
                    "verdict": "PASS",
                    "coverageState": "Submitted and indexed",
                    "lastCrawlTime": "2026-10-28T12:00:00Z",
                }
            },
            "token": "must-never-leak",
        }

    def submit_sitemap(self, site_url, sitemap_url):
        self.submitted.append((site_url, sitemap_url))


class SearchConsoleReportTests(unittest.TestCase):
    def test_selects_exact_domain_property(self):
        module = load_module()
        sites = FakeClient().list_sites()["siteEntry"]
        self.assertEqual(
            module.choose_property(sites, "https://leakfanhub.com"),
            "sc-domain:leakfanhub.com",
        )

    def test_report_bounds_inspection_and_never_returns_credentials(self):
        module = load_module()
        client = FakeClient()
        urls = [f"https://leakfanhub.com/alice/{index}" for index in range(20)]
        report = module.build_report(
            client=client,
            canonical_site="https://leakfanhub.com",
            start_date="2026-10-27",
            end_date="2026-10-28",
            inspect_urls=urls,
            inspection_limit=3,
            sitemap_url="https://leakfanhub.com/sitemap.xml",
            submit_sitemap=True,
        )

        self.assertEqual(len(client.inspected), 3)
        self.assertEqual(
            client.submitted,
            [("sc-domain:leakfanhub.com", "https://leakfanhub.com/sitemap.xml")],
        )
        self.assertEqual(report["performance"]["clicks"], 12.0)
        self.assertEqual(report["performance"]["impressions"], 99.0)
        self.assertEqual(report["inspections"][0]["verdict"], "PASS")
        serialized = str(report).lower()
        self.assertNotIn("must-never-leak", serialized)
        self.assertNotIn("access_token", serialized)
        self.assertNotIn("private_key", serialized)

    def test_rejects_cross_site_inspection_urls(self):
        module = load_module()
        with self.assertRaisesRegex(ValueError, "same site"):
            module.normalize_inspection_urls(
                ["https://evil.example/item"],
                "https://leakfanhub.com",
                10,
            )


if __name__ == "__main__":
    unittest.main()
