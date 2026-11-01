#!/usr/bin/env python3
"""Run the sibling operator script through the active application's network.

Uses the existing app DATABASE_URL without printing it or passing it in argv.
The sibling script remains dry-run by default; --apply must be explicit.
"""
import ipaddress
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

APP_CONTAINER = "photo-app-1"
DB_CONTAINER = "photo-mariadb-1"
NETWORK = "photo_lumen-internal"


def build_invocation(app_inspect, db_inspect, argv, python, script, nsenter):
    """Build command/environment from inspection data without executing anything."""
    target = None
    modes = []
    for argument in argv:
        if argument in {"--apply", "--dry-run"}:
            modes.append(argument)
        elif not isinstance(argument, str) or argument.startswith("-") or not argument.strip() or target is not None:
            raise ValueError("unsupported arguments")
        else:
            target = argument
    if target is None or len(modes) > 1:
        raise ValueError("one target and at most one mode are required")
    for executable in (python, script, nsenter):
        if not isinstance(executable, str) or not os.path.isabs(executable):
            raise ValueError("absolute executable paths are required")

    for record, name in ((app_inspect, APP_CONTAINER), (db_inspect, DB_CONTAINER)):
        if not isinstance(record, dict) or record.get("Name") != f"/{name}":
            raise ValueError("unexpected container")
        if record.get("State", {}).get("Running") is not True:
            raise ValueError("container is not running")
    pid = app_inspect["State"].get("Pid")
    if type(pid) is not int or pid <= 0:
        raise ValueError("invalid application process")
    app_networks = app_inspect.get("NetworkSettings", {}).get("Networks", {})
    db_networks = db_inspect.get("NetworkSettings", {}).get("Networks", {})
    if not isinstance(app_networks, dict) or not isinstance(db_networks, dict) or set(app_networks) & set(db_networks) != {NETWORK}:
        raise ValueError("unexpected shared network")
    address = ipaddress.ip_address(db_networks[NETWORK].get("IPAddress", ""))
    if address.is_loopback or address.is_unspecified or address.is_multicast:
        raise ValueError("invalid database address")

    environment = {}
    for entry in app_inspect.get("Config", {}).get("Env", []):
        if not isinstance(entry, str):
            raise ValueError("invalid application environment")
        key, separator, value = entry.partition("=")
        if key not in {"DATABASE_URL", "NEXT_PUBLIC_SITE_URL"}:
            continue
        if not separator or not value.strip() or "\0" in value or key in environment:
            raise ValueError("missing or duplicate application setting")
        environment[key] = value
    if set(environment) != {"DATABASE_URL", "NEXT_PUBLIC_SITE_URL"}:
        raise ValueError("required application settings are unavailable")
    command = [nsenter, "--target", str(pid), "--net", "--", python, script,
               target, *modes, "--db-host", str(address)]
    return command, environment


def main(argv=None):
    try:
        script = Path(__file__).with_name("reimport_data.py").resolve()
        if not script.is_file():
            raise FileNotFoundError("sibling operator script is unavailable")
        docker, nsenter = shutil.which("docker"), shutil.which("nsenter")
        if not docker or not nsenter:
            raise FileNotFoundError("required operator tools are unavailable")
        result = subprocess.run(
            [docker, "inspect", APP_CONTAINER, DB_CONTAINER],
            capture_output=True, text=True, timeout=15, check=False,
        )
        if result.returncode != 0:
            raise RuntimeError("container inspection failed")
        records = json.loads(result.stdout)
        if not isinstance(records, list) or len(records) != 2:
            raise ValueError("unexpected inspection response")
        by_name = {record.get("Name"): record for record in records}
        command, environment = build_invocation(
            by_name.get(f"/{APP_CONTAINER}"), by_name.get(f"/{DB_CONTAINER}"),
            sys.argv[1:] if argv is None else argv,
            sys.executable, str(script), nsenter,
        )
        os.execve(nsenter, command, environment)
        return 0
    except Exception as error:
        print(f"ERROR={type(error).__name__}; launcher refused; details omitted", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
