#!/usr/bin/env python3
"""Fetch exact LeakGallery title aliases for every creator in MariaDB → src/data/creator-aliases.json"""
from __future__ import annotations

import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "creator-aliases.json"
UA = "Mozilla/5.0 (compatible; LeakFanHubAliasSync/1.0)"

def load_env():
    env = {}
    p = Path("/opt/photo/.env.prod")
    if not p.exists():
        p = ROOT / ".env.prod"
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def handles_from_db(env):
    try:
        import mysql.connector
    except ImportError:
        return []
    db = env.get("DB_NAME") or "leakfanhub"
    # DATABASE_URL=mysql://user:pass@host:3306/db
    url = env.get("DATABASE_URL", "")
    user = env.get("DB_USER", "lumen")
    password = env.get("DB_PASSWORD", "LumenPass2026Strong")
    host = "127.0.0.1"
    if url.startswith("mysql"):
        # mysql://lumen:pass@mariadb:3306/leakfanhub
        m = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+)", url)
        if m:
            user, password, host = m.group(1), m.group(2), m.group(3)
            if host == "mariadb":
                host = "127.0.0.1"
            dbm = re.search(r"/([a-zA-Z0-9_]+)(?:\?|$)", url)
            if dbm:
                db = dbm.group(1)
    conn = mysql.connector.connect(
        host=host, user=user, password=password, database=db
    )
    cur = conn.cursor()
    cur.execute("SELECT handle FROM creators ORDER BY followers_count DESC")
    rows = [r[0] for r in cur.fetchall() if r[0]]
    conn.close()
    return rows

def parse_title_aliases(title: str, handle: string_type := str) -> list:
    t = re.sub(r"\s*/\s*Exclusive Leaked Nude OnlyFans.*$", "", title, flags=re.I)
    t = re.sub(r"\s*[·|]\s*.*$", "", t)
    parts = [p.strip() for p in t.split("/") if p.strip()]
    # drop pure #ids
    parts = [p for p in parts if not re.fullmatch(r"#?\d+", p)]
    return parts

def fetch_lg(handle: str) -> list[str]:
    url = f"https://leakgallery.com/{urllib.request.quote(handle)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            html = r.read().decode("utf-8", "ignore")
    except Exception as e:
        print("fail", handle, e)
        return []
    m = re.search(r"<title>([^<]+)</title>", html, re.I)
    if not m:
        return []
    parts = parse_title_aliases(m.group(1))
    # remove the handle itself (case-insensitive) for storage as pure aliases
    hl = handle.lower()
    return [p for p in parts if p.lower() != hl]

def main():
    env = load_env()
    handles = handles_from_db(env)
    if not handles:
        print("No handles from DB — abort")
        return
    print("creators", len(handles))

    existing = {"aliases": {}}
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text())
            if "aliases" not in existing:
                existing = {"aliases": existing}
        except Exception:
            existing = {"aliases": {}}

    aliases = dict(existing.get("aliases") or {})
    ok = 0
    for i, h in enumerate(handles):
        key = h.lower()
        got = fetch_lg(h)
        if got:
            # merge previous + new
            prev = aliases.get(key) or []
            seen = set(x.lower() for x in prev)
            merged = list(prev)
            for a in got:
                if a.lower() not in seen:
                    seen.add(a.lower())
                    merged.append(a)
            aliases[key] = merged
            ok += 1
            print(f"[{i+1}/{len(handles)}] {h}: {len(merged)} aliases")
        else:
            print(f"[{i+1}/{len(handles)}] {h}: (none)")
        time.sleep(0.35)  # be polite

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"aliases": aliases}, ensure_ascii=False, indent=2) + "\n")
    print("WROTE", OUT, "handles_with_aliases", ok)

if __name__ == "__main__":
    main()
