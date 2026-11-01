#!/usr/bin/env python3
"""Plan one active media URL-version change. No downloads or visibility changes.

Dry-run is the default. --apply updates at most one record: the selected profile
or media, never all of a creator's media. Supply the existing DATABASE_URL
in the process environment; no secret is accepted on the command line.
"""
import argparse
import json
import os
import re
import sys
import uuid
from urllib.parse import unquote, urlsplit

DEFAULT_SITE = "https://leakfanhub.com"
MAX_VERSION = 2_147_483_647
LOCALES = {"en", "fr", "es", "de", "it", "pt", "nl"}
RESERVED = LOCALES | {"api", "_next", "media", "sitemaps", "photo", "creator", "tag", "models", "feed", "about", "dmca", "contact", "premium", "favoris", "connexion", "inscription", "random", "photos", "videos", "popular", "search", "saved", "liked", "abonnements", "add", "apple-icon", "classements", "conditions", "confidentialite", "favicon.ico", "identite", "icon", "influenceuses-tendances", "mentions-legales", "most-liked", "pour-toi", "qu-est-ce-que-lumengallery", "recherche", "robots.txt", "sitemap.xml", "tiktok", "trending-medias", "trust-and-safety", "welcome", "favicon.svg", "file.svg", "globe.svg", "google652c2e22ed1e9315.html", "next.svg", "vercel.svg", "window.svg", "yandex_6d2a8a1dcea473d0.html"}


def _versioned(value):
    match = re.fullmatch(r"(.+)-v([1-9][0-9]*)", value)
    if match:
        version = int(match[2])
        if not 2 <= version <= MAX_VERSION:
            raise ValueError("invalid public version")
        return match[1], version
    if re.search(r"-v[0-9]+$", value):
        raise ValueError("invalid public version")
    return value, 1


def parse_url(url, site=DEFAULT_SITE):
    """Validate an exact first-party creator or media URL and its version."""
    try:
        configured, parsed = urlsplit(site), urlsplit(url.strip())
        if configured.scheme not in {"http", "https"} or not configured.hostname or configured.path not in {"", "/"}:
            raise ValueError
        if parsed.scheme or parsed.netloc:
            if parsed.scheme not in {"http", "https"} or parsed.hostname != configured.hostname or parsed.port != configured.port or parsed.username or parsed.password:
                raise ValueError
        elif not parsed.path.startswith("/"):
            raise ValueError
        if parsed.query or parsed.fragment or "//" in parsed.path:
            raise ValueError
        parts = [unquote(part, errors="strict") for part in parsed.path.strip("/").split("/")]
        if parts and parts[0] in LOCALES:
            parts = parts[1:]
        if len(parts) not in {1, 2}:
            raise ValueError
        handle, creator_version = _versioned(parts[0].lower())
        if not re.fullmatch(r"[a-z0-9._-]{1,100}", handle) or handle in RESERVED | {".", ".."} or re.search(r"-v[0-9]+$", handle):
            raise ValueError
        if len(parts) == 1:
            return handle, None, creator_version
        if creator_version != 1 or handle != parts[0].lower():
            raise ValueError
        media_id, version = _versioned(parts[1])
        if not re.fullmatch(r"[0-9]{1,191}", media_id) and str(uuid.UUID(media_id)) != media_id.lower():
            raise ValueError
        return handle, media_id.lower(), version
    except (ValueError, TypeError, AttributeError, UnicodeError):
        raise ValueError("invalid or non-canonical first-party target URL") from None


def database_config(dsn, *, host=None, port=None):
    """Use the existing DSN host and port without logging its values."""
    try:
        parsed = urlsplit(dsn)
        database = unquote(parsed.path.removeprefix("/"), errors="strict")
        target_host, target_port = host or parsed.hostname, port or parsed.port or 3306
        if parsed.scheme not in {"mysql", "mariadb"} or not target_host or parsed.username is None or parsed.password is None or parsed.query or parsed.fragment:
            raise ValueError
        if not re.fullmatch(r"[A-Za-z0-9_$-]+", database) or not 1 <= target_port <= 65535:
            raise ValueError
        if not re.fullmatch(r"[A-Za-z0-9._:-]+", target_host):
            raise ValueError
        return dict(host=target_host, port=target_port, user=unquote(parsed.username), password=unquote(parsed.password), database=database, autocommit=False, connection_timeout=10)
    except (ValueError, TypeError, AttributeError, UnicodeError):
        raise ValueError("invalid database configuration") from None


def connect_database(config):
    import mysql.connector
    return mysql.connector.connect(**config)


def process_target(cursor, target, *, apply=False):
    handle, media_id, expected = target
    kind = "creator" if media_id is None else "media"

    def outcome(status, **details):
        action = "dry_run" if status.startswith("would_bump_") else "applied" if status.startswith("bumped_") else "noop" if status == "already_advanced" else "blocked"
        return dict(status=status, action=action, target_kind=kind,
                    writes=1 if action == "applied" else 0, **details)

    if media_id is None:
        cursor.execute("""
            SELECT c.id AS creator_id, c.handle, c.url_version,
                   c.is_hidden AS creator_hidden,
                   c.removed_from_index_at AS creator_removed
            FROM creators c WHERE BINARY c.handle=BINARY %s LIMIT 2
            """, (handle,))
    else:
        if re.fullmatch(r"[0-9]{1,191}", media_id):
            # The public provider resolves numeric source IDs globally before
            # checking ownership, so another active owner makes this ambiguous.
            lookup = """p.source_id=%s AND p.is_hidden=0 AND c.is_hidden=0
                AND p.removed_from_index_at IS NULL AND c.removed_from_index_at IS NULL"""
            lookup_params = (media_id,)
        else:
            lookup = "BINARY c.handle=BINARY %s AND p.id=%s"
            lookup_params = (handle, media_id)
        cursor.execute(f"""
            SELECT p.id AS media_id, p.creator_id, c.handle, p.source_id,
                   p.url_version, p.is_hidden AS photo_hidden,
                   c.is_hidden AS creator_hidden,
                   p.removed_from_index_at AS photo_removed,
                   c.removed_from_index_at AS creator_removed
            FROM photos p JOIN creators c ON c.id=p.creator_id
            WHERE {lookup} LIMIT 2
            """, lookup_params)
    rows = cursor.fetchall()
    if not rows:
        return outcome("not_found")
    if len(rows) != 1:
        return outcome("ambiguous_target")
    row = rows[0]
    if row["handle"] != handle:
        return outcome("not_found")
    if media_id is not None:
        source_id = str(row["source_id"] or "")
        canonical_id = source_id if re.fullmatch(r"[0-9]+", source_id) else str(row["media_id"])
        if canonical_id != media_id:
            return outcome("non_canonical_target")
    if row["creator_hidden"] or row["creator_removed"] is not None or (media_id is not None and (row["photo_hidden"] or row["photo_removed"] is not None)):
        return outcome("not_public")
    current = int(row["url_version"] or 1)
    if current != expected:
        return outcome("already_advanced" if current == expected + 1 else "stale_url", current_version=current)
    if not 1 <= current < MAX_VERSION:
        return outcome("version_limit")
    if not apply:
        return outcome(f"would_bump_{kind}", next_version=current + 1)
    if media_id is None:
        cursor.execute("""
            UPDATE creators c SET c.url_version=%s, c.updated_at=NOW()
            WHERE c.id=%s AND BINARY c.handle=BINARY %s
              AND (c.url_version <=> %s)
              AND c.is_hidden=0 AND c.removed_from_index_at IS NULL
            """, (current + 1, row["creator_id"], handle, row["url_version"]))
    else:
        cursor.execute("""
            UPDATE photos p JOIN creators c ON c.id=p.creator_id
            SET p.url_version=%s, p.updated_at=NOW()
            WHERE p.id=%s AND p.creator_id=%s
              AND BINARY c.handle=BINARY %s
              AND (p.url_version <=> %s) AND (BINARY p.source_id <=> BINARY %s)
              AND p.is_hidden=0 AND c.is_hidden=0
              AND p.removed_from_index_at IS NULL AND c.removed_from_index_at IS NULL
            """, (current + 1, row["media_id"], row["creator_id"], handle, row["url_version"], row["source_id"]))
    if cursor.rowcount != 1:
        return outcome("concurrent_change")
    return outcome(f"bumped_{kind}", next_version=current + 1)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", help="Exact current first-party profile or media URL")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="Apply at most one version change")
    mode.add_argument("--dry-run", action="store_true", help="Plan only (the default)")
    parser.add_argument("--db-host", help="Non-secret host override for the existing database network")
    parser.add_argument("--db-port", type=int)
    args = parser.parse_args(argv)
    db = cursor = None
    try:
        target = parse_url(args.url, os.environ.get("NEXT_PUBLIC_SITE_URL", DEFAULT_SITE))
        config = database_config(os.environ["DATABASE_URL"], host=args.db_host, port=args.db_port)
        db = connect_database(config)
        cursor = db.cursor(dictionary=True)
        result = process_target(cursor, target, apply=args.apply)
        if result["action"] == "applied":
            db.commit()
        else:
            db.rollback()
        print(json.dumps(result, sort_keys=True))
        return 0 if result["action"] in {"dry_run", "applied", "noop"} else 2
    except Exception as error:
        if db is not None:
            try:
                db.rollback()
            except Exception:
                pass
        print(f"ERROR={type(error).__name__}; operation failed; credentials omitted", file=sys.stderr)
        return 1
    finally:
        for resource in (cursor, db):
            if resource is not None:
                try:
                    resource.close()
                except Exception:
                    pass


if __name__ == "__main__":
    raise SystemExit(main())
