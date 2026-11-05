"""Read-only creator discovery. Run with python -m ops.megabot_queue.discovery."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import random
import re
import stat
import sys
import tempfile
import time

from .notices import notice_matches
from .supervisor import read_config, verified_source


SOURCE_ORIGIN = "https://api.leakgallery.com"
MAX_PAGES = 5
MAX_PROFILE_CHECKS = 20
MAX_RESPONSE_BYTES = 512 * 1024
HANDLE = re.compile(r"[A-Za-z0-9._-]{1,100}", re.ASCII)
MEDIA_ID = re.compile(r"[1-9][0-9]{0,19}")
SOURCE_PATH = re.compile(r"/(?:popular/newest-profiles/[1-5]|profile/[A-Za-z0-9._-]{1,100}/1|media/[1-9][0-9]{0,19})")
CARD_FIELDS = {"added", "banner_pic", "profile_pic", "username"}
UNAVAILABLE_FIELDS = ("removed", "is_removed", "is_hidden", "removed_at", "removed_from_index_at", "error", "errors")


class DiscoveryError(RuntimeError):
    pass


def canonical_handle(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not HANDLE.fullmatch(value) or "..." in value or not any(ch.isalnum() for ch in value):
        return None
    return value.lower()


def historical_aliases(value):
    if value is None or (isinstance(value, str) and not value.strip()):
        return set()
    if isinstance(value, str):
        value = value.split("/")
    if not isinstance(value, list) or len(value) > 32:
        return None
    aliases = {canonical_handle(alias) for alias in value}
    return None if None in aliases else aliases


def media_identity(value):
    if type(value) not in (str, int):
        return None
    value = str(value)
    return value if MEDIA_ID.fullmatch(value) else None


def unavailable(record):
    return not isinstance(record, dict) or any(record.get(key) for key in UNAVAILABLE_FIELDS)


class SourceCatalogue:
    def __init__(self, session, origin, proxies, *, sleep=time.sleep):
        if origin.rstrip("/") != SOURCE_ORIGIN:
            raise DiscoveryError("invalid_source_origin")
        self.session = session
        self.proxies = proxies
        self.sleep = sleep
        self.started = False

    def fetch(self, path, *, params=None):
        if not SOURCE_PATH.fullmatch(path) or "/../" in path or "/./" in path:
            raise DiscoveryError("invalid_source_path")
        if self.started:
            self.sleep(2)
        self.started = True
        proxy = random.choice(self.proxies) if self.proxies else None
        deadline = time.monotonic() + 20
        try:
            with self.session.get(SOURCE_ORIGIN + path, params=params, stream=True,
                                  allow_redirects=False, timeout=(5, 10),
                                  proxies={"https": proxy} if proxy else {}) as response:
                if response.status_code == 404:
                    return None
                if response.status_code != 200:
                    raise DiscoveryError(f"source_http_{response.status_code}")
                body = bytearray()
                for chunk in response.iter_content(chunk_size=8192):
                    if len(body) + len(chunk) > MAX_RESPONSE_BYTES or time.monotonic() > deadline:
                        raise DiscoveryError("source_response_limit")
                    body.extend(chunk)
                return json.loads(body)
        except DiscoveryError:
            raise
        except Exception:
            raise DiscoveryError("source_request_failed") from None


def notice_excludes(handles, source_id, notices):
    return any(notice_matches({"handle": handle, "source_id": source_id}, notice)
               for handle in handles for notice in notices)


def discover(fetch, known_handles, notices, *, pages, profile_limit, on_profile_check=None):
    if type(pages) is not int or not 1 <= pages <= MAX_PAGES or (
            type(profile_limit) is not int or not 1 <= profile_limit <= MAX_PROFILE_CHECKS):
        raise DiscoveryError("invalid_discovery_limit")

    cards = {}
    counts = Counter(cards=0, profileChecks=0, known=0, excluded=0, ambiguous=0)
    for page in range(1, pages + 1):
        listing = fetch(f"/popular/newest-profiles/{page}")
        if not isinstance(listing, list) or len(listing) > 100:
            raise DiscoveryError("invalid_catalogue")
        counts["cards"] += len(listing)
        for card in listing:
            if unavailable(card) or not CARD_FIELDS.issubset(card):
                counts["excluded"] += 1
                continue
            handle = canonical_handle(card["username"])
            if handle is None:
                counts["ambiguous"] += 1
                continue
            cards.setdefault(handle, card["username"].strip())

    confirmed = []
    identity_counts = Counter(cards.keys())
    for handle, original in cards.items():
        if handle in known_handles:
            counts["known"] += 1
            continue
        if notice_excludes((handle,), None, notices):
            counts["excluded"] += 1
            continue
        if counts["profileChecks"] >= profile_limit:
            break
        counts["profileChecks"] += 1
        if on_profile_check is not None:
            on_profile_check(handle)
        profile_page = fetch(f"/profile/{original}/1", params={"type": "All", "sort": "MostRecent"})
        media = [] if unavailable(profile_page) else profile_page.get("medias")
        if not isinstance(media, list) or len(media) > 500:
            counts["ambiguous"] += 1
            continue
        first_id = next((identity for item in media if not unavailable(item)
                         if (identity := media_identity(item.get("id"))) is not None), None)
        if first_id is None:
            counts["excluded"] += 1
            continue
        details = fetch(f"/media/{first_id}")
        author = details.get("profile") if not unavailable(details) else None
        if unavailable(author):
            counts["excluded"] += 1
            continue
        aliases = historical_aliases(author["old_usernames"]) if "old_usernames" in author else None
        if media_identity(details.get("id")) != first_id or canonical_handle(author.get("username")) != handle or aliases is None:
            counts["ambiguous"] += 1
            continue
        aliases.discard(handle)
        identity_counts.update(aliases)
        identities = {handle, *aliases}
        if identities & known_handles:
            counts["known"] += 1
        elif notice_excludes(identities, first_id, notices):
            counts["excluded"] += 1
        else:
            confirmed.append((handle, aliases))

    candidates = []
    for handle, aliases in confirmed:
        if any(identity_counts[identity] != 1 for identity in {handle, *aliases}):
            counts["ambiguous"] += 1
            continue
        candidates.append({"handle": handle, "aliases": sorted(aliases), "identityNeedsVerification": True})
    return {"schemaVersion": 1, "source": "leakgallery", "approvalStatus": "review_required",
            "generatedAt": datetime.now(timezone.utc).isoformat(), "pages": pages,
            "counts": {**counts, "candidates": len(candidates)}, "candidates": candidates}


def read_existing(env):
    import mysql.connector

    connection = mysql.connector.connect(host=env["MEGABOT_DB_HOST"], port=int(env.get("MEGABOT_DB_PORT", "3306")),
        user=env["MEGABOT_DB_USER"], password=env.get("MEGABOT_DB_PASSWORD") or env["DB_PASSWORD"],
        database=env["MEGABOT_DB_NAME"], connection_timeout=5)
    try:
        cursor = connection.cursor(dictionary=True)
        try:
            cursor.execute("SET SESSION max_statement_time=8")
            connection.start_transaction(readonly=True)
            cursor.execute("SELECT handle FROM creators")
            known = {canonical_handle(row["handle"]) for row in cursor.fetchall()}
            cursor.execute("SELECT DISTINCT creator_handle FROM bot_ingested")
            known.update(canonical_handle(row["creator_handle"]) for row in cursor.fetchall())
            known.discard(None)
            cursor.execute("SELECT urls FROM dmca_notices")
            notices = list(cursor.fetchall())
            cursor.execute("SELECT urls, targets FROM dmca_mail_events")
            notices.extend(cursor.fetchall())
            return known, notices
        finally:
            cursor.close()
    finally:
        try:
            connection.rollback()
        finally:
            connection.close()


def write_manifest(destination, manifest):
    destination = Path(destination)
    parent = destination.parent.resolve(strict=True)
    metadata = parent.stat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
        raise DiscoveryError("manifest_directory_not_private")
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf8", dir=parent, delete=False) as temporary:
        try:
            os.fchmod(temporary.fileno(), 0o600)
            json.dump(manifest, temporary, ensure_ascii=False, indent=2)
            temporary.write("\n")
            temporary.flush()
            os.fsync(temporary.fileno())
            os.link(temporary.name, parent / destination.name)
        finally:
            os.unlink(temporary.name)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Discover creator candidates without publishing media or modifying the catalogue.")
    parser.add_argument("--config", default="/etc/megabot-queue/config.json", type=Path)
    parser.add_argument("--pages", type=int, required=True, choices=range(1, MAX_PAGES + 1))
    parser.add_argument("--profile-limit", type=int, required=True, choices=range(1, MAX_PROFILE_CHECKS + 1))
    parser.add_argument("--output", type=Path, required=True, help="New file in an existing owner-only directory")
    args = parser.parse_args(argv)
    try:
        import requests

        config = read_config(args.config)
        verified_source(config)
        env = config["env"]
        with requests.Session() as session:
            session.trust_env = False
            session.headers["Accept"] = "application/json"
            proxies = [proxy.strip() for proxy in env.get("MEGABOT_PROXIES", "").split(",") if proxy.strip()]
            source = SourceCatalogue(session, env.get("MEGABOT_BASE_URL", SOURCE_ORIGIN), proxies)
            known, notices = read_existing(env)
            manifest = discover(source.fetch, known, notices, pages=args.pages, profile_limit=args.profile_limit)
        write_manifest(args.output, manifest)
        print(json.dumps(manifest["counts"]))
        return 0
    except DiscoveryError as error:
        print(str(error), file=sys.stderr)
    except Exception:
        print("discovery_unavailable", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
