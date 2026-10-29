#!/usr/bin/env python3
"""Build and atomically activate nginx tombstones for removed public media.

The hot request path is an in-memory nginx map. MariaDB is queried only by the
systemd timer, never by an asset request. The previous map remains active when
the database query, nginx validation, or nginx reload fails.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from typing import Any, Iterable
from urllib.parse import unquote, urlsplit


SAFE_HANDLE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
SAFE_DATABASE = re.compile(r"^[A-Za-z0-9_]{1,64}$")
CREATOR_QUERY = """
SELECT 'creator', c.handle, COALESCE(c.avatar_url, ''),
       COALESCE(c.cover_url, '')
FROM creators c
WHERE c.removed_from_index_at IS NOT NULL
UNION ALL
SELECT 'photo', '', COALESCE(p.image_url, ''),
       COALESCE(p.video_url, '')
FROM photos p
JOIN creators c ON c.id = p.creator_id
WHERE p.removed_from_index_at IS NOT NULL
   OR (
     c.removed_from_index_at IS NOT NULL
     AND c.handle NOT REGEXP '^[A-Za-z0-9_.-]{1,100}$'
   )
""".strip()


def _media_paths(value: Any, allowed_hosts: set[str]) -> set[str]:
    if not isinstance(value, str) or not value:
        return set()
    try:
        parsed = urlsplit(value)
    except ValueError:
        return set()

    if parsed.scheme or parsed.netloc:
        if parsed.scheme.lower() not in {"http", "https"}:
            return set()
        if (parsed.hostname or "").lower() not in allowed_hosts:
            return set()

    candidates = {parsed.path, unquote(parsed.path)}
    result: set[str] = set()
    for path in candidates:
        if not path.startswith("/media/"):
            continue
        if any(ord(char) < 32 or ord(char) == 127 for char in path):
            continue
        if ".." in path.split("/"):
            continue
        result.add(path)
    return result


def _fixture_tombstones(
    payload: dict[str, Any], allowed_hosts: set[str]
) -> tuple[set[str], set[str]]:
    handles: set[str] = set()
    paths: set[str] = set()

    for creator in payload.get("creators", []):
        if not isinstance(creator, dict) or not creator.get("removedFromIndexAt"):
            continue
        handle = creator.get("handle")
        if isinstance(handle, str) and SAFE_HANDLE.fullmatch(handle):
            handles.add(handle.lower())
        paths.update(_media_paths(creator.get("avatarUrl"), allowed_hosts))
        paths.update(_media_paths(creator.get("coverUrl"), allowed_hosts))

    for photo in payload.get("photos", []):
        if not isinstance(photo, dict):
            continue
        if not (
            photo.get("removedFromIndexAt")
            or photo.get("creatorRemovedFromIndexAt")
        ):
            continue
        paths.update(_media_paths(photo.get("imageUrl"), allowed_hosts))
        paths.update(_media_paths(photo.get("videoUrl"), allowed_hosts))

    return handles, paths


def _database_tombstones(
    database_url: str,
    database_host: str,
    database_port: int | None,
    allowed_hosts: set[str],
) -> tuple[set[str], set[str]]:
    try:
        import mysql.connector  # type: ignore[import-untyped]
    except ImportError as error:
        raise RuntimeError("mysql-connector-python is required") from error

    try:
        parsed = urlsplit(database_url)
        if parsed.scheme.lower() not in {"mysql", "mariadb"}:
            raise ValueError
        if parsed.username is None or parsed.password is None:
            raise ValueError
        database = unquote(parsed.path.lstrip("/"))
        if not SAFE_DATABASE.fullmatch(database):
            raise ValueError
        port = database_port if database_port is not None else (parsed.port or 3306)
        if not database_host or not 1 <= port <= 65535:
            raise ValueError
        config = {
            "host": database_host,
            "port": port,
            "user": unquote(parsed.username),
            "password": unquote(parsed.password),
            "database": database,
            "connection_timeout": 15,
        }
    except (TypeError, ValueError) as error:
        raise RuntimeError("DATABASE_URL is invalid") from error

    connection = None
    cursor = None
    try:
        connection = mysql.connector.connect(**config)
        cursor = connection.cursor()
        cursor.execute(CREATOR_QUERY)
        rows = cursor.fetchall()
    except Exception:
        # Connector exceptions may contain endpoint/user details. Keep the
        # service log deliberately generic and never echo DATABASE_URL.
        raise RuntimeError("database connection or query failed") from None
    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass

    handles: set[str] = set()
    paths: set[str] = set()
    for row in rows:
        if len(row) != 4:
            raise RuntimeError("unexpected database response shape")
        try:
            kind, handle, first, second = (
                value.decode("utf-8") if isinstance(value, bytes) else value or ""
                for value in row
            )
        except UnicodeDecodeError as error:
            raise RuntimeError("invalid database response encoding") from error
        if not all(isinstance(value, str) for value in (kind, handle, first, second)):
            raise RuntimeError("unexpected database response type")
        if kind == "creator" and SAFE_HANDLE.fullmatch(handle):
            handles.add(handle.lower())
        paths.update(_media_paths(first, allowed_hosts))
        paths.update(_media_paths(second, allowed_hosts))

    return handles, paths


def _nginx_string(value: str) -> str:
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("nginx map key contains a control character")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def render_map(handles: Iterable[str], paths: Iterable[str]) -> str:
    creator_entries = "\n".join(
        f"  {_nginx_string(handle)} 1;" for handle in sorted(set(handles))
    )
    object_entries = "\n".join(
        f"  {_nginx_string(path)} 1;" for path in sorted(set(paths))
    )
    if creator_entries:
        creator_entries += "\n"
    if object_entries:
        object_entries += "\n"

    return f"""# Generated by ops/refresh-removed-media-map.py. Do not edit.
# Loaded in nginx's http context; every media request stays DB-free.
map_hash_bucket_size 128;
map_hash_max_size 262144;

map $uri $media_creator_path_handle {{
  default "";
  ~^/media/creators/(?<media_tombstone_creator>[A-Za-z0-9_.-]+)/ $media_tombstone_creator;
}}

map $media_creator_path_handle $media_removed_creator {{
  default 0;
{creator_entries}}}

map $uri $media_removed_object {{
  default 0;
{object_entries}}}

map "$media_removed_creator:$media_removed_object" $media_tombstone_state {{
  default active;
  ~^1: removed;
  ~:1$ removed;
}}

map $media_tombstone_state $media_tombstoned {{
  default 0;
  removed 1;
}}

map $media_tombstone_state $media_cache_control {{
  default "public, max-age=300, stale-while-revalidate=60";
  removed "no-store, max-age=0";
}}

map $media_tombstone_state $media_robots_tag {{
  default "";
  removed "noindex, noarchive";
}}
"""


def _atomic_write(path: Path, content: bytes, mode: int = 0o640) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if temporary.exists():
            temporary.unlink()


def _run_nginx(docker_bin: str, container: str, arguments: list[str]) -> None:
    result = subprocess.run(
        [docker_bin, "exec", container, "nginx", *arguments],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        detail = result.stderr.strip().splitlines()[-1:] or ["nginx command failed"]
        raise RuntimeError(detail[0])


def _restore(path: Path, previous: bytes | None, previous_mode: int) -> None:
    if previous is None:
        path.unlink(missing_ok=True)
    else:
        _atomic_write(path, previous, previous_mode)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/opt/photo/infra/nginx/generated/removed-media-maps.conf"),
    )
    parser.add_argument("--state-file", type=Path)
    parser.add_argument(
        "--lock-file",
        type=Path,
        default=Path("/run/leakfanhub-media-tombstones.lock"),
    )
    parser.add_argument("--docker-bin", default="/usr/bin/docker")
    parser.add_argument("--edge-container", default="photo-edge-1")
    parser.add_argument(
        "--database-host",
        default=os.environ.get("MEDIA_TOMBSTONE_DB_HOST", "127.0.0.1"),
    )
    parser.add_argument("--database-port", type=int)
    parser.add_argument("--allowed-host", action="append", default=[])
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    args.lock_file.parent.mkdir(parents=True, exist_ok=True)
    allowed_hosts = {
        host.strip().lower()
        for host in [
            "leakfanhub.com",
            "www.leakfanhub.com",
            *os.environ.get("MEDIA_TOMBSTONE_ALLOWED_HOSTS", "").split(","),
            *args.allowed_host,
        ]
        if host.strip()
    }
    state_file = args.state_file or Path(f"{args.output}.sha256")

    with args.lock_file.open("a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        if args.fixture:
            payload = json.loads(args.fixture.read_text("utf-8"))
            handles, paths = _fixture_tombstones(payload, allowed_hosts)
        else:
            database_url = os.environ.get("DATABASE_URL", "")
            if not database_url:
                raise RuntimeError("DATABASE_URL is required")
            database_port = args.database_port
            if database_port is None and os.environ.get("MEDIA_TOMBSTONE_DB_PORT"):
                try:
                    database_port = int(os.environ["MEDIA_TOMBSTONE_DB_PORT"])
                except ValueError as error:
                    raise RuntimeError("MEDIA_TOMBSTONE_DB_PORT is invalid") from error
            handles, paths = _database_tombstones(
                database_url,
                args.database_host,
                database_port,
                allowed_hosts,
            )

        candidate = render_map(handles, paths).encode("utf-8")
        digest = hashlib.sha256(candidate).hexdigest()
        previous = args.output.read_bytes() if args.output.exists() else None
        previous_mode = (
            args.output.stat().st_mode & 0o777 if args.output.exists() else 0o640
        )
        activated_digest = (
            state_file.read_text("ascii").strip() if state_file.exists() else ""
        )
        if previous == candidate and activated_digest == digest:
            return 0

        _atomic_write(args.output, candidate)
        try:
            _run_nginx(args.docker_bin, args.edge_container, ["-t", "-q"])
            _run_nginx(args.docker_bin, args.edge_container, ["-s", "reload"])
        except Exception:
            _restore(args.output, previous, previous_mode)
            raise

        _atomic_write(state_file, f"{digest}\n".encode("ascii"), 0o640)
        print(f"activated {len(handles)} creator and {len(paths)} object tombstones")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"media tombstone refresh failed: {error}", file=sys.stderr)
        raise SystemExit(1)
