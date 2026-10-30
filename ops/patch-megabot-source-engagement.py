#!/usr/bin/env python3
"""Preview or apply the identifier-only MegaBot engagement migration."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import stat
import sys
import tempfile


INSERT_REPLACEMENT = (
    "views_count, likes_count, is_ai, file_size, source_id",
    "source_views_count, source_likes_count, is_ai, file_size, source_id",
)
UPDATE_REPLACEMENTS = (
    (
        "views_count = VALUES(views_count)",
        "source_views_count = VALUES(source_views_count)",
    ),
    (
        "likes_count = VALUES(likes_count)",
        "source_likes_count = VALUES(source_likes_count)",
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("target", type=Path, help="path to the existing megabot.py")
    parser.add_argument(
        "--write",
        action="store_true",
        help="apply after printing the identifier-only replacement plan",
    )
    return parser.parse_args()


def write_owned_fd(fd: int, content: bytes, metadata: os.stat_result) -> None:
    remaining = memoryview(content)
    while remaining:
        written = os.write(fd, remaining)
        remaining = remaining[written:]
    os.fchown(fd, metadata.st_uid, metadata.st_gid)
    os.fchmod(fd, stat.S_IMODE(metadata.st_mode))
    os.fsync(fd)


def create_owned_file(
    path: Path,
    content: bytes,
    metadata: os.stat_result,
) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags, 0o600)
    try:
        write_owned_fd(fd, content, metadata)
    except BaseException:
        os.close(fd)
        path.unlink(missing_ok=True)
        raise
    else:
        os.close(fd)


def fsync_directory(path: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    fd = os.open(path, flags)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def main() -> int:
    args = parse_args()
    target = args.target.resolve(strict=True)
    metadata = target.stat()
    original = target.read_text(encoding="utf-8")

    insert_old, insert_new = INSERT_REPLACEMENT
    insert_counts = (original.count(insert_old), original.count(insert_new))
    if insert_counts not in ((1, 0), (0, 1)):
        print(
            "refusing to patch: expected exactly one unpatched or patched "
            f"photo counter column list, found old={insert_counts[0]} "
            f"new={insert_counts[1]}",
            file=sys.stderr,
        )
        return 2

    update_counts = tuple(
        (original.count(old), original.count(new))
        for old, new in UPDATE_REPLACEMENTS
    )
    if update_counts == ((0, 0), (0, 0)):
        update_state = "absent"
    elif update_counts == ((1, 0), (1, 0)):
        update_state = "unpatched"
    elif update_counts == ((0, 1), (0, 1)):
        update_state = "patched"
    else:
        print(
            "refusing to patch: update counter identifiers are ambiguous or partial",
            file=sys.stderr,
        )
        return 2

    insert_state = "unpatched" if insert_counts == (1, 0) else "patched"
    if insert_state == "patched" and update_state in ("patched", "absent"):
        print("MegaBot source engagement identifiers are already patched.")
        return 0
    if insert_state != update_state and update_state != "absent":
        print(
            "refusing to patch: insert and update counter identifiers are inconsistent",
            file=sys.stderr,
        )
        return 2

    replacements = (INSERT_REPLACEMENT,)
    if update_state == "unpatched":
        replacements += UPDATE_REPLACEMENTS

    for old, _ in replacements:
        if original.count(old) != 1:
            print(
                f"refusing to patch: expected exactly one occurrence of {old!r}",
                file=sys.stderr,
            )
            return 2

    patched = original
    for old, new in replacements:
        patched = patched.replace(old, new, 1)

    # Never echo source lines: a credential could share a line with the SQL.
    # The preview is intentionally limited to the exact identifier tokens.
    print("Identifier-only patch plan:")
    for old, new in replacements:
        print(f"- {old}")
        print(f"+ {new}")

    if not args.write:
        print("Preview only. Re-run with --write to apply.")
        return 0

    backup = target.with_name(f"{target.name}.before-source-engagement")
    if backup.exists():
        print(f"refusing to overwrite existing backup: {backup}", file=sys.stderr)
        return 3
    try:
        create_owned_file(backup, original.encode("utf-8"), metadata)
    except FileExistsError:
        print(f"refusing to overwrite existing backup: {backup}", file=sys.stderr)
        return 3

    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.source-engagement.",
        suffix=".tmp",
        dir=target.parent,
    )
    temporary = Path(temporary_name)
    try:
        write_owned_fd(fd, patched.encode("utf-8"), metadata)
        os.close(fd)
        fd = -1
        os.replace(temporary, target)
        fsync_directory(target.parent)
    finally:
        if fd >= 0:
            os.close(fd)
        temporary.unlink(missing_ok=True)
    print(f"Patched {target}; backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
