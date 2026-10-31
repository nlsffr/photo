#!/usr/bin/env python3
"""Metadata-only DMCA catalog reconciliation.

This program deliberately does not import requests, boto3, or any downloader.
It uses bot_ingested as the authoritative source-id to photo-id mapping and
separates a legacy public ID such as ``123-v21`` into ``source_id=123`` and
``url_version=21``. The public sitemap is generated from those database rows
at request time.
"""

import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import mysql.connector


DEFAULT_MANIFEST = Path("/opt/photo/dmca/to_reimport.json")
DEFAULT_ENV = Path("/opt/photo/.env.prod")


def normalize_handle(handle: object) -> str:
    if not isinstance(handle, str):
        raise ValueError("creator handle must be a string")
    value = handle.strip().lower()
    if not re.fullmatch(r"[a-z0-9._-]{1,100}", value):
        raise ValueError("creator handle contains invalid characters or length")
    return value


def parse_public_id(source_id: object) -> tuple[str, int | None] | None:
    value = str(source_id or "").strip()
    match = re.fullmatch(r"([0-9]+)(?:-v([1-9][0-9]*))?", value)
    if not match:
        return None
    return match.group(1), int(match.group(2)) if match.group(2) else None


def collect_targets(
    data: object,
) -> tuple[
    set[str],
    set[tuple[str, str, int | None]],
    dict[tuple[str, str], tuple[int, ...]],
]:
    """Return full-profile handles and explicitly requested numeric IDs.

    A missing creator must explicitly supply photo_ids=[] to select all its
    tracked media. Malformed or omitted lists must never expand that scope.
    """
    sections = {"creators_manquantes", "medias_manquants_sur_creatrices_existantes"}
    if not isinstance(data, dict) or not sections.intersection(data):
        raise ValueError("manifest must be an object with a recognized target section")
    for section in sections:
        if section in data and not isinstance(data[section], dict):
            raise ValueError(f"{section} must be an object")
    full_handles: set[str] = set()
    requested_versions: dict[tuple[str, str], set[int | None]] = {}

    def add_explicit(handle: str, raw_id: object) -> None:
        if type(raw_id) not in (str, int):
            raise ValueError("media ID must be a string or integer")
        public_id = parse_public_id(raw_id)
        if not public_id or not 0 < int(public_id[0]) < 2**63:
            raise ValueError("media ID must contain a positive BIGINT source ID")
        source_id, version = public_id
        if version is not None and version >= 2**31:
            raise ValueError("media URL version exceeds the INT range")
        requested_versions.setdefault((handle, source_id), set()).add(version)

    missing = data.get("creators_manquantes", {})
    for raw_handle, details in missing.items():
        handle = normalize_handle(raw_handle)
        if not isinstance(details, dict) or not isinstance(details.get("photo_ids"), list):
            raise ValueError("missing creator must provide a photo_ids list")
        photo_ids = details["photo_ids"]
        if not photo_ids:
            full_handles.add(handle)
        for raw_id in photo_ids:
            add_explicit(handle, raw_id)

    partial = data.get("medias_manquants_sur_creatrices_existantes", {})
    for raw_handle, photo_ids in partial.items():
        handle = normalize_handle(raw_handle)
        if not isinstance(photo_ids, list):
            raise ValueError("partial creator must provide a media ID list")
        for raw_id in photo_ids:
            add_explicit(handle, raw_id)

    explicit: set[tuple[str, str, int | None]] = set()
    conflicts: dict[tuple[str, str], tuple[int, ...]] = {}
    for key, versions in requested_versions.items():
        numbered = tuple(sorted(version for version in versions if version is not None))
        if len(numbered) > 1:
            conflicts[key] = numbered
        else:
            explicit.add((*key, numbered[0] if numbered else None))

    return full_handles, explicit, conflicts


class ManifestRepair:
    def __init__(self, cursor: Any):
        self.cursor = cursor

    def source_ids_for_handle(self, handle: str) -> set[str]:
        self.cursor.execute(
            """
            SELECT source_id FROM bot_ingested FORCE INDEX (idx_bot_handle)
            WHERE creator_handle=%s
            """,
            (handle,),
        )
        return {str(row[0]) for row in self.cursor.fetchall()}

    def repair_one(
        self,
        expected_handle: str,
        source_id: str,
        _requested_version: int | None,
        *,
        dry_run: bool,
    ) -> str:
        public_id = parse_public_id(source_id)
        if not public_id:
            return "invalid_source_id"
        numeric_id, _ = public_id

        # source_id is looked up from the indexed bot_ingested recovery map,
        # rather than relying on a direct lookup in legacy photos.source_id.
        self.cursor.execute(
            """
            SELECT b.source_id, b.creator_handle, b.photo_id,
                   c.handle AS current_creator_handle,
                   p.source_id AS current_source_id,
                   p.url_version,
                   p.removed_from_index_at, c.removed_from_index_at,
                   p.is_hidden, c.is_hidden
            FROM bot_ingested b
            JOIN photos p ON p.id=b.photo_id
            JOIN creators c ON c.id=p.creator_id
            WHERE b.source_id=%s AND b.creator_handle=%s
            LIMIT 1
            """,
            (int(numeric_id), expected_handle),
        )
        row = self.cursor.fetchone()
        if not row:
            return "unresolved"

        (
            mapped_source_id,
            mapped_handle,
            photo_id,
            current_handle,
            current_source_id,
            url_version,
            photo_removed,
            creator_removed,
            photo_hidden,
            creator_hidden,
        ) = row
        if mapped_handle != expected_handle or current_handle != expected_handle:
            return "creator_mismatch"
        if photo_removed is not None or creator_removed is not None or photo_hidden or creator_hidden:
            return "not_indexable"
        desired_source_id = str(mapped_source_id)
        expected_source_id = current_source_id
        current_source_id = str(current_source_id or "")
        embedded_current = parse_public_id(current_source_id)
        # A manifest suffix can be stale. Only a suffix currently embedded in
        # photos.source_id is a defect to normalize into the version column.
        desired_version = int(url_version or 1)
        if embedded_current and embedded_current[0] == desired_source_id:
            if embedded_current[1] is not None and embedded_current[1] < desired_version:
                return "version_conflict"
            desired_version = embedded_current[1] or desired_version

        if current_source_id == desired_source_id and int(url_version or 1) == desired_version:
            return "already_indexed"
        if dry_run:
            return "would_update"

        self.cursor.execute(
            """
            UPDATE photos p
            JOIN creators c ON c.id=p.creator_id
            JOIN bot_ingested b ON b.photo_id=p.id
            SET p.source_id=%s, p.url_version=%s
            WHERE p.id=%s AND b.source_id=%s
              AND BINARY b.creator_handle=BINARY %s
              AND BINARY c.handle=BINARY %s
              AND (BINARY p.source_id <=> BINARY %s)
              AND (p.url_version <=> %s)
              AND p.is_hidden=0 AND c.is_hidden=0
              AND p.removed_from_index_at IS NULL
              AND c.removed_from_index_at IS NULL
            """,
            (desired_source_id, desired_version, photo_id, mapped_source_id,
             mapped_handle, current_handle, expected_source_id, url_version),
        )
        return "updated" if self.cursor.rowcount == 1 else "concurrent_change"

    def run(
        self,
        handles: set[str],
        explicit: set[tuple[str, str, int | None]],
        *,
        conflicts: dict[tuple[str, str], tuple[int, ...]] | None = None,
        dry_run: bool,
    ) -> Counter[str]:
        conflicts = conflicts or {}
        targets = {(handle, source_id): version for handle, source_id, version in explicit}
        for handle in sorted(handles):
            for source_id in self.source_ids_for_handle(handle):
                if (handle, source_id) not in conflicts:
                    targets.setdefault((handle, source_id), None)

        result: Counter[str] = Counter()
        for key in sorted(conflicts):
            targets.pop(key, None)
            result["checked"] += 1
            result["version_conflict"] += 1
        for (handle, source_id), requested_version in sorted(targets.items()):
            result["checked"] += 1
            result[
                self.repair_one(
                    handle, source_id, requested_version, dry_run=dry_run
                )
            ] += 1
        return result


def result_exit_code(result: dict[str, int] | Counter[str]) -> int:
    """Report unresolved catalog targets to callers without downloading them."""
    degraded = (
        "unresolved",
        "creator_mismatch",
        "not_indexable",
        "invalid_source_id",
        "version_conflict",
        "concurrent_change",
    )
    return 2 if any(result.get(name, 0) for name in degraded) else 0


def should_commit(result: dict[str, int] | Counter[str], *, dry_run: bool) -> bool:
    """Commit validated repairs; unresolved targets remain explicitly reported."""
    return not dry_run


def load_environment(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        raw = raw.strip()
        if raw and not raw.startswith("#") and "=" in raw:
            key, value = raw.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Réconciliation DMCA sans téléchargement")
    parser.add_argument("--dry-run", action="store_true", help="vérifie sans modifier la base")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args(argv)

    load_environment(DEFAULT_ENV)
    data = json.loads(args.manifest.read_text())
    full_handles, explicit, conflicts = collect_targets(data)
    db = mysql.connector.connect(
        host="127.0.0.1",
        user=os.environ.get("DB_USER", "lumen"),
        password=os.environ["DB_PASSWORD"],
        database=os.environ.get("DB_NAME", "leakfanhub"),
        autocommit=False,
        connection_timeout=10,
    )
    try:
        result = ManifestRepair(db.cursor()).run(
            full_handles, explicit, conflicts=conflicts, dry_run=args.dry_run
        )
        if should_commit(result, dry_run=args.dry_run):
            db.commit()
        else:
            db.rollback()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("MODE=metadata-only; network_downloads=0")
    print("SITEMAP=dynamic-from-active-photos")
    print("URL_VERSION=preserve-active-normalize-embedded")
    print(json.dumps(dict(sorted(result.items())), ensure_ascii=False))
    for (handle, source_id), versions in sorted(conflicts.items()):
        print(f"VERSION_CONFLICT={handle}/{source_id}:" + ",".join(map(str, versions)))
    return result_exit_code(result)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERREUR={type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(1)
