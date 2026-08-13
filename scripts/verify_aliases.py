#!/usr/bin/env python3
"""Verify SEO aliases match LG density: exact LG list or ~2 smart typos."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALIASES_FILE = ROOT / "src" / "data" / "creator-aliases.json"
MAX_ALT_WHEN_LG = 7
AVG_ALT_WHEN_EMPTY = 2

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
    import mysql.connector
    db = env.get("DB_NAME") or "leakfanhub"
    url = env.get("DATABASE_URL", "")
    user = env.get("DB_USER", "lumen")
    password = env.get("DB_PASSWORD", "LumenPass2026Strong")
    host = "127.0.0.1"
    if url.startswith("mysql"):
        m = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+)", url)
        if m:
            user, password, host = m.group(1), m.group(2), m.group(3)
            if host == "mariadb":
                host = "127.0.0.1"
            dbm = re.search(r"/([a-zA-Z0-9_]+)(?:\?|$)", url)
            if dbm:
                db = dbm.group(1)
    conn = mysql.connector.connect(host=host, user=user, password=password, database=db)
    cur = conn.cursor()
    cur.execute("SELECT handle FROM creators ORDER BY handle")
    rows = [r[0] for r in cur.fetchall() if r[0]]
    conn.close()
    return rows

def load_lg_map():
    if not ALIASES_FILE.exists():
        return {}
    data = json.loads(ALIASES_FILE.read_text())
    if isinstance(data, dict) and "aliases" in data:
        return {k.lower(): v for k, v in data["aliases"].items()}
    return {k.lower(): v for k, v in data.items() if isinstance(v, list)}

def generate_typos(h: str):
    h = h.lower().strip()
    if len(h) < 3:
        return []
    out, seen = [], {h}

    def add(v):
        t = v.lower()
        if len(t) < 3 or len(t) > 42 or t in seen:
            return
        seen.add(t)
        out.append(t)

    add(h + h[-1])
    add(h[:-1])
    if not h.endswith("s"):
        add(h + "s")
    if "i" in h:
        add(h.replace("i", "y"))
    if "er" in h:
        add(h.replace("er", "ar"))
    if "ai" in h:
        add(h.replace("ai", "ay"))
    for i in range(1, len(h) - 1):
        add(h[:i] + h[i + 1] + h[i] + h[i + 2 :])
    for i in range(len(h) - 1, 0, -1):
        add(h[:i] + h[i + 1 :])
    return out

def build_alts(handle: str, lg_map: dict):
    primary = handle.strip()
    seen = {primary.lower()}
    list_ = []

    def push(raw):
        t = str(raw).strip()
        if not t or len(t) < 2:
            return
        k = t.lower()
        if k in seen:
            return
        seen.add(k)
        list_.append(t)

    lg = lg_map.get(primary.lower(), []) or []
    for a in lg:
        push(a)
    if lg:
        return list_[:MAX_ALT_WHEN_LG], len(lg)
    for a in generate_typos(primary):
        if len(list_) >= AVG_ALT_WHEN_EMPTY:
            break
        push(a)
    return list_[:AVG_ALT_WHEN_EMPTY], 0

def main():
    env = load_env()
    handles = handles_from_db(env)
    lg_map = load_lg_map()
    print(f"creators={len(handles)} lg_json={len(lg_map)}")
    print(f"rule: LG exact (max {MAX_ALT_WHEN_LG} alts) OR {AVG_ALT_WHEN_EMPTY} smart typos")

    totals = []  # total names in title = 1 handle + alts
    with_lg = 0
    without = 0
    for i, h in enumerate(handles, 1):
        alts, lg_n = build_alts(h, lg_map)
        total = 1 + len(alts)  # handle + alts
        totals.append(total)
        if lg_n:
            with_lg += 1
            flag = "LG"
        else:
            without += 1
            flag = "TYPO"
        if i <= 5 or i % 500 == 0 or h in ("sophieraiin", "amouranth", "megnut"):
            print(f"[{i}/{len(handles)}] {h}: title_names={total} alts={alts} ({flag} lg={lg_n})")

    avg = sum(totals) / max(len(totals), 1)
    print("=" * 50)
    print(f"TOTAL creators {len(handles)}")
    print(f"with LG aliases: {with_lg}")
    print(f"typo-only (avg fill): {without}")
    print(f"AVG names in title (handle+alts): {avg:.2f}")
    print(f"MIN {min(totals)} MAX {max(totals)}")

if __name__ == "__main__":
    main()
