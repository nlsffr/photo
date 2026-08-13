#!/usr/bin/env python3
"""Verify every creator gets up to 12 SEO aliases (LG exact + smart typos)."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALIASES_FILE = ROOT / "src" / "data" / "creator-aliases.json"
MAX_ALIASES = 12
MIN_ALIASES = 12

NEIGH = {
    "a": "sqwz", "b": "vghn", "c": "xdfv", "d": "sfrecx",
    "e": "wrsdf", "f": "dgrtcv", "g": "fhtybv", "h": "gjyunb",
    "i": "ujko", "j": "hkuinm", "k": "jloi", "l": "kop",
    "m": "njk", "n": "bhjm", "o": "iklp", "p": "ol",
    "q": "wa", "r": "edft", "s": "awedxz", "t": "rfgy",
    "u": "yhij", "v": "cfgb", "w": "qase", "x": "zsdc",
    "y": "tghu", "z": "asx",
}

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
    out = []
    seen = {h}

    def add(v):
        t = v.lower()
        if len(t) < 3 or len(t) > 42 or t in seen:
            return
        seen.add(t)
        out.append(t)

    add(h + h[-1])
    add(h[:-1])
    if len(h) > 4:
        add(h[:-2])
    if not h.endswith("s"):
        add(h + "s")
    else:
        add(h[:-1])
    if h.endswith("n") and not h.endswith("nn"):
        add(h + "n")
    if h.endswith("nn"):
        add(h[:-1])
    if h.endswith("e"):
        add(h[:-1])
    else:
        add(h + "e")
    if not h.endswith("x"):
        add(h + "x")
    if not h.endswith("xx"):
        add(h + "xx")
    if not h.endswith("of"):
        add(h + "of")

    if "i" in h:
        add(h.replace("i", "y"))
    if "y" in h:
        add(h.replace("y", "i"))
    if "ph" in h:
        add(h.replace("ph", "f"))
    if "er" in h:
        add(h.replace("er", "ar"))
    if "ar" in h:
        add(h.replace("ar", "er"))
    if "ai" in h:
        add(h.replace("ai", "ay"))
    if "ay" in h:
        add(h.replace("ay", "ai"))
    if "ie" in h:
        add(h.replace("ie", "ei"))
    if "ll" in h:
        add(h.replace("ll", "l"))
    if "nn" in h:
        add(h.replace("nn", "n"))

    for i in range(1, len(h) - 1):
        c = h[i]
        if c in "aeioulnrs" and h[i - 1] != c and h[i + 1] != c:
            add(h[:i] + c + h[i:])

    for i in range(1, len(h) - 1):
        add(h[:i] + h[i + 1] + h[i] + h[i + 2 :])

    for i in range(len(h) - 1, 0, -1):
        add(h[:i] + h[i + 1 :])
    add(h[1:])

    for i in range(1, len(h)):
        for ch in NEIGH.get(h[i], ""):
            if len(out) > 50:
                break
            add(h[:i] + ch + h[i + 1 :])

    for i in range(1, len(h)):
        add(h[:i] + h[i] + h[i:])

    return out

def build_list(handle: str, lg_map: dict):
    primary = handle.strip()
    seen = {primary.lower()}
    list_ = []

    def push(raw):
        t = raw.strip()
        if not t or len(t) < 2:
            return
        k = t.lower()
        if k in seen:
            return
        seen.add(k)
        list_.append(t)

    for a in lg_map.get(primary.lower(), []) or []:
        push(str(a))
    for a in generate_typos(primary):
        if len(list_) >= MAX_ALIASES:
            break
        push(a)
    return list_[:MAX_ALIASES]

def main():
    env = load_env()
    handles = handles_from_db(env)
    lg_map = load_lg_map()
    print(f"creators={len(handles)} lg_json={len(lg_map)} MAX={MAX_ALIASES}")

    counts = []
    low = []
    for i, h in enumerate(handles, 1):
        aliases = build_list(h, lg_map)
        n = len(aliases)
        counts.append(n)
        flag = "OK" if n >= MIN_ALIASES else "LOW"
        lg_n = len(lg_map.get(h.lower(), []) or [])
        print(f"[{i}/{len(handles)}] {h}: {n} aliases (lg={lg_n}) {flag}")
        if n < MIN_ALIASES:
            low.append((h, n))

    avg = sum(counts) / max(len(counts), 1)
    print("=" * 50)
    print(f"TOTAL {len(handles)}")
    print(f"AVG aliases {avg:.1f}")
    print(f"MIN {min(counts) if counts else 0} MAX {max(counts) if counts else 0}")
    print(f">= {MIN_ALIASES}: {sum(1 for c in counts if c >= MIN_ALIASES)}")
    print(f"< {MIN_ALIASES}: {len(low)}")
    if low[:20]:
        print("examples LOW:", low[:20])

if __name__ == "__main__":
    main()
