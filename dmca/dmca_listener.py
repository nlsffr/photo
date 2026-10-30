#!/usr/bin/env python3
# dmca_listener.py — Lit Gmail (notifs Search Console), bump url_version, journalise.
# Idempotent : dédoublonnage par urls_hash. Détection auto du dossier "Tous les messages".
import imaplib, email, re, json, os, subprocess, sys, hashlib
from pathlib import Path

GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_APP_PW = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
CONTAINER, DB = "photo-mariadb-1", "leakfanhub"
MYSQL_HOST = "127.0.0.1"
UID_STATE_FILE = Path(os.environ.get("DMCA_UID_STATE_FILE", "/opt/photo/dmca/.listener_uid"))
URL_RE = re.compile(r'https://leakfanhub\.com/[^\s"\'<>\)\],;}]+')
MOIS = {"janv":1,"jan":1,"fevr":2,"févr":2,"mars":3,"avr":4,"avril":4,"mai":5,"juin":6,
        "juil":7,"juillet":7,"aout":8,"août":8,"sept":9,"oct":10,"nov":11,"dec":12,"déc":12}

def mysql(sql):
    p = subprocess.run(["docker","exec","-e","MARIADB_ROOT_PASSWORD="+os.environ["MARIADB_ROOT_PASSWORD"],"-i",CONTAINER,"sh","-c",
        f'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" {DB}'],
        input=sql.encode(), capture_output=True)
    out = (p.stdout + p.stderr).decode()
    if p.returncode != 0:
        raise RuntimeError(out)
    return out

def esc(s): return s.replace("\\", "\\\\").replace("'", "''")

def load_last_uid():
    try:
        value = int(UID_STATE_FILE.read_text(encoding="ascii").strip())
        return max(value, 0)
    except (FileNotFoundError, ValueError, OSError):
        return 0

def save_last_uid(uid):
    tmp = UID_STATE_FILE.with_suffix(UID_STATE_FILE.suffix + ".tmp")
    tmp.write_text(f"{uid}\n", encoding="ascii")
    os.chmod(tmp, 0o600)
    os.replace(tmp, UID_STATE_FILE)

def fr_date(s):
    m = re.match(r'\s*(\d{1,2})\s+([a-zA-Zéû\.]+?)\.?\s+(\d{4})', s or "")
    if not m: return None
    mo = MOIS.get(m.group(2).lower().rstrip('.'))
    return f"{int(m.group(3)):04d}-{mo:02d}-{int(m.group(1)):02d}" if mo else None

def get_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/plain":
                return part.get_payload(decode=True).decode("utf-8", "replace")
            if ct == "text/html":
                html = part.get_payload(decode=True).decode("utf-8", "replace")
                return re.sub(r'<[^>]+>', ' ', html)
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            return payload.decode("utf-8", "replace")
    return ""

def pick_all_mail(M):
    """Détecte le dossier 'Tous les messages' (All Mail) quel que soit la langue du compte."""
    typ, folders = M.list()
    candidates = []
    for line in (folders or []):
        s = line.decode(errors="replace") if isinstance(line, bytes) else str(line)
        if ("All Mail" in s) or ("Tous les messages" in s):
            m = re.search(r'("(?:[^"\\]|\\.)*")\s*$', s)
            if m: candidates.append(m.group(1))
    for c in candidates:
        typ, _ = M.select(c, readonly=True)
        if typ == "OK":
            return c
    return None

def classify(u):
    base = u.split("?")[0].split("#")[0].rstrip("/")
    path = base[len("https://leakfanhub.com"):]
    segs = [s for s in path.split("/") if s]
    if not segs: return None
    if segs[0] == "media":
        m = re.match(r'(\d+)_thumb\.(?:webp|jpe?g|png)$', segs[-1])
        if m: return ("asset_photo", m.group(1))
        return ("asset", None)
    if len(segs) == 1: return ("profile", segs[0])
    return ("photo", segs[0], segs[1])

def bump(u):
    c = classify(u)
    if not c: return ("skip", u, 0)
    if c[0] == "profile":
        out = mysql(f"UPDATE creators SET url_version=url_version+1, removed_from_index_at=NOW() WHERE handle='{esc(c[1])}'; SELECT ROW_COUNT();")
        n = out.strip().splitlines()[-1] if out.strip() else "0"
        return ("profile", c[1], int(n or 0))
    if c[0] == "photo":
        out = mysql(f"UPDATE photos p JOIN creators c ON p.creator_id=c.id SET p.url_version=p.url_version+1, p.removed_from_index_at=NOW() WHERE c.handle='{esc(c[1])}' AND (p.source_id='{esc(c[2])}' OR p.id='{esc(c[2])}'); SELECT ROW_COUNT();")
        n = out.strip().splitlines()[-1] if out.strip() else "0"
        return ("photo", f"{c[1]}/{c[2]}", int(n or 0))
    if c[0] == "asset_photo":
        out = mysql(f"UPDATE photos SET url_version=url_version+1, removed_from_index_at=NOW() WHERE source_id='{esc(c[1])}'; SELECT ROW_COUNT();")
        n = out.strip().splitlines()[-1] if out.strip() else "0"
        return ("asset", c[1], int(n or 0))
    return ("asset_or_autre", u, 0)

def main():
    if not GMAIL_USER or not GMAIL_APP_PW:
        print("ERREUR: GMAIL_USER / GMAIL_APP_PASSWORD manquants (charge .env)"); sys.exit(1)
    M = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    M.login(GMAIL_USER, GMAIL_APP_PW)
    mailbox = pick_all_mail(M)
    if not mailbox:
        print("Dossier 'Tous les messages' introuvable, fallback INBOX")
        typ, _ = M.select("INBOX", readonly=True)
        if typ != "OK":
            print("ERREUR: impossible de sélectionner INBOX"); sys.exit(1)
        mailbox = "INBOX"
    print(f"Boîte sélectionnée : {mailbox}")
    last_uid = load_last_uid()
    uid_range = f"UID {last_uid + 1}:* " if last_uid else ""
    criteria = f'({uid_range}OR FROM "legalremovals@google.com" FROM "sc-noreply@google.com")'
    typ, data = M.uid("search", None, criteria)
    if typ != "OK":
        raise RuntimeError("La recherche IMAP UID a échoué")
    ids = [uid for uid in (data[0].split() if data and data[0] else []) if int(uid) > last_uid]
    print(f"[{len(ids)} mails Google trouvés]")
    known_hashes = {
        line.strip().lower()
        for line in mysql("SELECT urls_hash FROM dmca_notices WHERE urls_hash IS NOT NULL;").splitlines()
        if re.fullmatch(r"[0-9a-fA-F]{64}", line.strip())
    }
    new, skipped, ignored = 0, 0, 0
    max_uid = last_uid
    for num in ids:
        typ, md = M.uid("fetch", num, "(RFC822)")
        if typ != "OK" or not md or not isinstance(md[0], tuple):
            raise RuntimeError(f"Impossible de lire le message UID {num.decode(errors='replace')}")
        max_uid = max(max_uid, int(num))
        msg = email.message_from_bytes(md[0][1])
        body = get_body(msg)
        if "Les URL mises en cause" not in body:
            ignored += 1; continue
        i = body.find("Les URL mises en cause")
        sec = body[i:]
        e = sec.find("Besoin d'aide")
        if e > 0: sec = sec[:e]
        urls = sorted(set(u.rstrip('.,;') for u in URL_RE.findall(sec)))
        if not urls:
            ignored += 1; continue
        fp = hashlib.sha256("\n".join(urls).encode()).hexdigest()
        if fp in known_hashes:
            skipped += 1; continue
        ag = re.search(r'Titulaire des droits représenté\s*:\s*([^\n<]+)', body)
        agent = ag.group(1).strip()[:255] if ag else None
        agent_esc = esc(agent) if agent else None
        dt = re.search(r'Date de la réclamation\s*:\s*([^\n<]+)', body)
        claimed = fr_date(dt.group(1)) if dt else None
        mnum = re.search(r'notices/(\d+)', body)
        jurls = esc(json.dumps(urls)[1:-1])
        details = [bump(u) for u in urls]
        touched = sum(1 for d in details if d[2] > 0)
        print(f"NOTICE [{mnum.group(1) if mnum else 'n/a'}] {len(urls)} URLs -> {touched} objets bumpés | agent={agent}")
        for d in details:
            if d[2] > 0 or d[0] == "asset_or_autre":
                print(f"   - {d[0]:12} {d[1][:80]} (rows={d[2]})")
        sql_cl = "NULL" if not claimed else f"'{claimed}'"
        sql_ag = "NULL" if not agent_esc else f"'{agent_esc}'"
        sql_ni = "NULL" if not mnum else f"'{mnum.group(1)}'"
        mysql(f"INSERT IGNORE INTO dmca_notices (received_at, claimed_at, agent, urls, notice_id, urls_hash, status) VALUES (NOW(), {sql_cl}, {sql_ag}, '[{jurls}]', {sql_ni}, '{fp}', 'applied');")
        known_hashes.add(fp)
        new += 1
    M.logout()
    if max_uid > last_uid:
        save_last_uid(max_uid)
    print(f"DONE: {new} nouvelles notices traitées, {skipped} déjà connues, {ignored} mails sans URLs.")

if __name__ == "__main__":
    main()
