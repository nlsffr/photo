#!/usr/bin/env python3
"""Bounded Search Console report and sitemap submission.

The script deliberately emits a selected summary instead of raw API responses,
so OAuth tokens and service-account key material never reach stdout.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterable


READ_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
WRITE_SCOPE = "https://www.googleapis.com/auth/webmasters"
DEFAULT_KEY_FILE = Path("/opt/photo/dmca/gsc_key.json")
DEFAULT_SITE = "https://leakfanhub.com"


class SearchConsoleError(RuntimeError):
    pass


def _http_url(value: str) -> urllib.parse.SplitResult:
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"Expected an HTTP(S) URL: {value!r}")
    return parsed


def choose_property(site_entries: Iterable[dict[str, Any]], canonical_site: str) -> str:
    host = _http_url(canonical_site).hostname
    assert host is not None
    usable = [
        str(entry.get("siteUrl", ""))
        for entry in site_entries
        if entry.get("permissionLevel") != "siteUnverifiedUser"
    ]
    domain_property = f"sc-domain:{host}"
    if domain_property in usable:
        return domain_property
    canonical = canonical_site.rstrip("/") + "/"
    if canonical in usable:
        return canonical
    raise SearchConsoleError(f"No verified Search Console property covers {host}")


def normalize_inspection_urls(
    urls: Iterable[str], canonical_site: str, limit: int
) -> list[str]:
    site = _http_url(canonical_site)
    safe_limit = min(10, max(0, int(limit)))
    normalized: list[str] = []
    for raw in urls:
        parsed = _http_url(raw)
        if parsed.hostname != site.hostname:
            raise ValueError("Inspection URLs must belong to the same site")
        value = urllib.parse.urlunsplit(parsed)
        if value not in normalized:
            normalized.append(value)
        if len(normalized) >= safe_limit:
            break
    return normalized


def _summarize_performance(response: dict[str, Any]) -> dict[str, Any]:
    rows = response.get("rows") if isinstance(response.get("rows"), list) else []
    clicks = sum(float(row.get("clicks", 0) or 0) for row in rows if isinstance(row, dict))
    impressions = sum(
        float(row.get("impressions", 0) or 0) for row in rows if isinstance(row, dict)
    )
    weighted_position = sum(
        float(row.get("position", 0) or 0) * float(row.get("impressions", 0) or 0)
        for row in rows
        if isinstance(row, dict)
    )
    daily = []
    for row in rows[:100]:
        if not isinstance(row, dict):
            continue
        keys = row.get("keys") if isinstance(row.get("keys"), list) else []
        daily.append(
            {
                "date": str(keys[0]) if keys else None,
                "clicks": float(row.get("clicks", 0) or 0),
                "impressions": float(row.get("impressions", 0) or 0),
            }
        )
    return {
        "clicks": clicks,
        "impressions": impressions,
        "ctr": clicks / impressions if impressions else 0.0,
        "average_position": weighted_position / impressions if impressions else None,
        "days": daily,
    }


def _summarize_inspection(url: str, response: dict[str, Any]) -> dict[str, Any]:
    result = response.get("inspectionResult")
    index = result.get("indexStatusResult") if isinstance(result, dict) else None
    index = index if isinstance(index, dict) else {}
    return {
        "url": url,
        "verdict": index.get("verdict"),
        "coverage_state": index.get("coverageState"),
        "indexing_state": index.get("indexingState"),
        "robots_txt_state": index.get("robotsTxtState"),
        "last_crawl_time": index.get("lastCrawlTime"),
    }


def build_report(
    *,
    client: Any,
    canonical_site: str,
    start_date: str,
    end_date: str,
    inspect_urls: Iterable[str],
    inspection_limit: int,
    sitemap_url: str,
    submit_sitemap: bool,
    property_override: str | None = None,
) -> dict[str, Any]:
    sites_response = client.list_sites()
    entries = sites_response.get("siteEntry")
    entries = entries if isinstance(entries, list) else []
    verified = [
        {
            "site_url": str(entry.get("siteUrl", "")),
            "permission_level": str(entry.get("permissionLevel", "")),
        }
        for entry in entries
        if isinstance(entry, dict)
    ]
    property_url = property_override or choose_property(entries, canonical_site)
    if property_override and property_override not in {
        entry["site_url"] for entry in verified
    }:
        raise SearchConsoleError("Requested Search Console property is unavailable")
    performance_response = client.query_performance(
        property_url,
        {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": ["date"],
            "rowLimit": 100,
            "dataState": "final",
        },
    )
    bounded_urls = normalize_inspection_urls(
        inspect_urls, canonical_site, inspection_limit
    )
    inspections = [
        _summarize_inspection(url, client.inspect_url(property_url, url))
        for url in bounded_urls
    ]
    submitted = False
    if submit_sitemap:
        _http_url(sitemap_url)
        client.submit_sitemap(property_url, sitemap_url)
        submitted = True
    return {
        "property": property_url,
        "available_properties": verified,
        "range": {"start_date": start_date, "end_date": end_date},
        "performance": _summarize_performance(performance_response),
        "inspections": inspections,
        "sitemap": {"url": sitemap_url, "submitted": submitted},
    }


class SearchConsoleClient:
    def __init__(self, access_token: str, timeout: int = 20):
        self._access_token = access_token
        self._timeout = timeout

    def _request(
        self, method: str, url: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {self._access_token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "LeakFanHub-SearchConsole/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            raise SearchConsoleError(
                f"Search Console API returned HTTP {error.code}"
            ) from None
        except urllib.error.URLError as error:
            raise SearchConsoleError("Search Console API is unreachable") from error

    def list_sites(self) -> dict[str, Any]:
        return self._request("GET", "https://www.googleapis.com/webmasters/v3/sites")

    def query_performance(
        self, site_url: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        encoded = urllib.parse.quote(site_url, safe="")
        return self._request(
            "POST",
            f"https://www.googleapis.com/webmasters/v3/sites/{encoded}/searchAnalytics/query",
            payload,
        )

    def inspect_url(self, site_url: str, inspection_url: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
            {
                "inspectionUrl": inspection_url,
                "siteUrl": site_url,
                "languageCode": "en-US",
            },
        )

    def submit_sitemap(self, site_url: str, sitemap_url: str) -> None:
        encoded_site = urllib.parse.quote(site_url, safe="")
        encoded_feed = urllib.parse.quote(sitemap_url, safe="")
        self._request(
            "PUT",
            f"https://www.googleapis.com/webmasters/v3/sites/{encoded_site}/sitemaps/{encoded_feed}",
        )


def _access_token(key_file: Path, write: bool) -> str:
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account
    except ImportError as error:
        raise SearchConsoleError(
            "Install scripts/requirements-search-console.txt before running this command"
        ) from error
    scope = WRITE_SCOPE if write else READ_SCOPE
    credentials = service_account.Credentials.from_service_account_file(
        str(key_file), scopes=[scope]
    )
    credentials.refresh(Request())
    if not credentials.token:
        raise SearchConsoleError("Google did not issue an OAuth access token")
    return str(credentials.token)


def _date(value: str) -> str:
    try:
        return dt.date.fromisoformat(value).isoformat()
    except ValueError as error:
        raise argparse.ArgumentTypeError("expected YYYY-MM-DD") from error


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    today = dt.datetime.now(dt.timezone.utc).date()
    end = today - dt.timedelta(days=2)
    start = end - dt.timedelta(days=27)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--key-file", type=Path, default=DEFAULT_KEY_FILE)
    parser.add_argument("--site", default=DEFAULT_SITE)
    parser.add_argument("--property")
    parser.add_argument("--start-date", type=_date, default=start.isoformat())
    parser.add_argument("--end-date", type=_date, default=end.isoformat())
    parser.add_argument("--inspect-url", action="append", default=[])
    parser.add_argument("--inspection-limit", type=int, default=5)
    parser.add_argument("--sitemap", default=f"{DEFAULT_SITE}/sitemap.xml")
    parser.add_argument("--submit-sitemap", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.start_date > args.end_date:
            raise ValueError("start date must not be after end date")
        if not args.key_file.is_file():
            raise SearchConsoleError(f"Credential file not found: {args.key_file}")
        inspection_urls = args.inspect_url or [args.site.rstrip("/") + "/"]
        client = SearchConsoleClient(
            _access_token(args.key_file, args.submit_sitemap)
        )
        report = build_report(
            client=client,
            canonical_site=args.site,
            start_date=args.start_date,
            end_date=args.end_date,
            inspect_urls=inspection_urls,
            inspection_limit=args.inspection_limit,
            sitemap_url=args.sitemap,
            submit_sitemap=args.submit_sitemap,
            property_override=args.property,
        )
        print(json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True))
        return 0
    except (SearchConsoleError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
