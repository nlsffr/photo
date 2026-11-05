#!/usr/bin/env python3
"""Resolve the MariaDB address on the private Docker network before polling."""

import ipaddress
import json
import os
from pathlib import Path
import subprocess
import sys


def main() -> None:
    container, network = sys.argv[1:]
    network_json = subprocess.check_output(
        [
            "/usr/bin/docker", "inspect", "--type", "container",
            "--format", "{{if .State.Running}}{{json .NetworkSettings.Networks}}{{else}}{}{{end}}",
            container,
        ],
        timeout=5,
        text=True,
    )
    networks = json.loads(network_json)
    if network not in networks:
        raise SystemExit("MariaDB is unavailable on the private Docker network")

    address = ipaddress.IPv4Address(networks[network]["IPAddress"])
    if not address.is_private or address.is_unspecified or address.is_loopback:
        raise SystemExit("MariaDB has no private Docker address")

    os.environ["TELEGRAM_WORKER_DATABASE_HOST"] = str(address)
    worker = Path(__file__).resolve().with_name("telegram_premium_worker.py")
    os.execv(sys.executable, [sys.executable, str(worker)])


if __name__ == "__main__":
    main()
