#!/usr/bin/env python3
"""Apply one repository SQL migration using DATABASE_URL without logging it."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import sys
from typing import Iterator
from urllib.parse import unquote, urlsplit


SAFE_DATABASE = re.compile(r"^[A-Za-z0-9_]{1,64}$")
DELIMITER_DIRECTIVE = re.compile(r"^DELIMITER\s+(\S+)$", re.IGNORECASE)


def split_mysql_script(source: str) -> Iterator[str]:
    """Split mysql-client SQL, including DELIMITER-wrapped triggers."""

    delimiter = ";"
    pending: list[str] = []
    for line in source.splitlines(keepends=True):
        directive = DELIMITER_DIRECTIVE.fullmatch(line.strip())
        if directive:
            if "".join(pending).strip():
                raise ValueError("DELIMITER changed inside an unfinished statement")
            delimiter = directive.group(1)
            continue

        pending.append(line)
        buffered = "".join(pending).rstrip()
        if not buffered.endswith(delimiter):
            continue
        statement = buffered[: -len(delimiter)].strip()
        pending.clear()
        if statement:
            yield statement

    if "".join(pending).strip():
        raise ValueError("migration ends with an unfinished statement")


def database_config(database_url: str, host: str) -> dict[str, object]:
    try:
        parsed = urlsplit(database_url)
        if parsed.scheme.lower() not in {"mysql", "mariadb"}:
            raise ValueError
        if parsed.username is None or parsed.password is None:
            raise ValueError
        database = unquote(parsed.path.lstrip("/"))
        if not SAFE_DATABASE.fullmatch(database):
            raise ValueError
        port = parsed.port or 3306
        if not host or not 1 <= port <= 65535:
            raise ValueError
        return {
            "host": host,
            "port": port,
            "user": unquote(parsed.username),
            "password": unquote(parsed.password),
            "database": database,
            "connection_timeout": 15,
            "autocommit": False,
        }
    except (TypeError, ValueError) as error:
        raise RuntimeError("DATABASE_URL is invalid") from error


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("migration", type=Path)
    parser.add_argument(
        "--database-host",
        default=os.environ.get("MIGRATION_DATABASE_HOST", "127.0.0.1"),
    )
    parser.add_argument("--check", action="store_true", help="parse only")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    source = args.migration.read_text("utf-8")
    statements = list(split_mysql_script(source))
    if not statements:
        raise RuntimeError("migration contains no SQL statements")
    if args.check:
        print(f"parsed {len(statements)} statements")
        return 0

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    try:
        import mysql.connector  # type: ignore[import-untyped]
    except ImportError as error:
        raise RuntimeError("mysql-connector-python is required") from error

    connection = None
    cursor = None
    statement_number = 0
    try:
        connection = mysql.connector.connect(
            **database_config(database_url, args.database_host)
        )
        cursor = connection.cursor()
        for statement_number, statement in enumerate(statements, start=1):
            cursor.execute(statement)
            while cursor.nextset():
                pass
        connection.commit()
    except Exception as error:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
        error_name = type(error).__name__
        raise RuntimeError(
            f"migration failed at statement {statement_number or 1} ({error_name})"
        ) from None
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

    print(f"applied {args.migration.name}: {len(statements)} statements")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
