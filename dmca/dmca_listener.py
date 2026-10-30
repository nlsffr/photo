#!/usr/bin/env python3
"""Read authenticated Google notices, hide affected records and audit decisions.

Unknown decisions require review. No URL rotation, reimport or Google submission
is triggered by email. Existing UID state prevents replaying historical notices.
"""
import argparse
import email
import hashlib
import imaplib
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

from google_mail_policy import get_body, normalize_url, parse_message

GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_APP_PW = os.environ.get("GMAIL_APP_PASSWORD", "").strip()
CONTAINER, DB = "photo-mariadb-1", "leakfanhub"
UID_STATE_FILE = Path(os.environ.get("DMCA_UID_STATE_FILE", "/opt/photo/dmca/.listener_uid"))
LOCALES = {"en", "fr", "es", "de", "it", "pt", "nl"}
RESERVED = LOCALES | {"media", "api", "models", "trending-medias", "most-liked", "classements", "influenceuses-tendances", "connexion", "inscription", "premium", "contact", "recherche", "search", "sitemap.xml", "robots.txt", "sitemaps", "dmca", "privacy", "terms"}


def mysql(sql):
    result = subprocess.run(
        ["docker", "exec", "-e", "MYSQL_PWD=" + os.environ["MARIADB_ROOT_PASSWORD"],
         "-i", CONTAINER, "mariadb", "-uroot", "-N", "-B", "--raw", DB],
        input=("SET NAMES utf8mb4;\n" + sql).encode(), capture_output=True, timeout=90,
    )
    if result.returncode:
        # SQL text and connector errors may contain private notice details.
        raise RuntimeError("MariaDB query failed; email cursor was not advanced")
    return result.stdout.decode("utf-8")


def sql_text(value):
    if value is None:
        return "NULL"
    return "CONVERT(X'" + str(value).encode("utf-8").hex() + "' USING utf8mb4)"


def ensure_schema():
    mysql("""CREATE TABLE IF NOT EXISTS dmca_mail_events (
      event_hash CHAR(64) PRIMARY KEY,
      mailbox_uid BIGINT UNSIGNED NOT NULL,
      decision VARCHAR(32) NOT NULL,
      reason VARCHAR(255) NOT NULL,
      case_id VARCHAR(96) NULL,
      notice_id VARCHAR(64) NULL,
      urls JSON NOT NULL,
      targets JSON NOT NULL,
      unresolved_urls JSON NOT NULL,
      outcome VARCHAR(32) NOT NULL,
      affected_rows INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;""")


def known_event_hashes():
    return {line.strip() for line in mysql("SELECT event_hash FROM dmca_mail_events;").splitlines()}


def load_last_uid():
    try:
        return max(int(UID_STATE_FILE.read_text(encoding="ascii").strip()), 0)
    except FileNotFoundError:
        raise RuntimeError("Missing email cursor; historical notices must not be replayed") from None
    except (ValueError, OSError) as error:
        raise RuntimeError("Unreadable email cursor; refusing to replay notices") from error


def save_last_uid(uid):
    temporary = UID_STATE_FILE.with_suffix(UID_STATE_FILE.suffix + ".tmp")
    temporary.write_text(f"{uid}\n", encoding="ascii")
    os.chmod(temporary, 0o600)
    os.replace(temporary, UID_STATE_FILE)


def pick_all_mail(mailbox):
    status, folders = mailbox.list()
    if status != "OK":
        raise RuntimeError("IMAP folder listing failed")
    for line in folders or []:
        text = line.decode(errors="replace") if isinstance(line, bytes) else str(line)
        if not any(token in text for token in ("\\All", "All Mail", "Tous les messages")):
            continue
        match = re.search(r'("(?:[^"\\]|\\.)*")\s*$', text)
        if match and mailbox.select(match.group(1), readonly=True)[0] == "OK":
            return match.group(1)
    return None


def verify_mailbox_binding(mailbox, folder, bind=False):
    """An IMAP UID is meaningful only within one mailbox and UIDVALIDITY."""
    status, values = mailbox.response("UIDVALIDITY")
    if status != "UIDVALIDITY" or not values or not values[0] or not values[0].isdigit():
        raise RuntimeError("Cannot verify mailbox UIDVALIDITY")
    identity = {"folder": folder, "uidvalidity": int(values[0])}
    path = UID_STATE_FILE.with_name(UID_STATE_FILE.name + ".mailbox.json")
    if path.exists():
        try:
            previous = json.loads(path.read_text("utf-8"))
        except (ValueError, OSError) as error:
            raise RuntimeError("Unreadable mailbox binding; review required") from error
        if previous != identity:
            raise RuntimeError("Mailbox or UIDVALIDITY changed; refusing to skip or replay emails")
    elif bind:
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(identity) + "\n", encoding="utf-8")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    else:
        raise RuntimeError("Mailbox binding missing; run --bind-mailbox once with the existing cursor")


def resolve_url(url):
    """Match an existing record by handle AND media identity, without guessing.

    Both a literal -vN handle and its unversioned form are considered; if both
    exist the decision requires review rather than hiding the wrong creator.
    """
    normalized = normalize_url(url)
    if not normalized:
        return []
    parts = [part for part in urlsplit(normalized).path.split("/") if part]
    if parts and parts[0] in LOCALES:
        parts = parts[1:]
    if not parts or len(parts) > 2 or parts[0] in RESERVED:
        return []
    handle = parts[0]
    if not re.fullmatch(r"[a-zA-Z0-9._-]{1,100}", handle):
        return []
    handles = {handle, re.sub(r"-v[1-9][0-9]*$", "", handle)}
    handles_sql = ",".join(sql_text(item) for item in sorted(handles))
    if len(parts) == 1 or parts[1] in {"photos", "videos", "popular"}:
        query = f"""SELECT JSON_OBJECT('kind','creator','id',id,
          'is_hidden',is_hidden,'removed_at',removed_from_index_at)
          FROM creators WHERE handle IN ({handles_sql}) LIMIT 2;"""
    else:
        media_id = re.sub(r"-v[1-9][0-9]*$", "", parts[1])
        if not re.fullmatch(r"(?:[0-9]{1,20}|[0-9a-fA-F-]{36})", media_id):
            return []
        media_sql = sql_text(media_id)
        query = f"""SELECT JSON_OBJECT('kind','photo','id',p.id,
          'is_hidden',p.is_hidden,'removed_at',p.removed_from_index_at)
          FROM photos p JOIN creators c ON c.id=p.creator_id
          WHERE c.handle IN ({handles_sql})
          AND (p.source_id={media_sql} OR p.id={media_sql}) LIMIT 2;"""
    rows = [json.loads(line) for line in mysql(query).splitlines() if line.strip()]
    return rows if len(rows) == 1 else []


def record_event(event_hash, uid, decision, targets, unresolved):
    # Only authenticated, recognized removals can change publication state.
    actionable = decision.kind == "removal"
    if targets and not actionable:
        raise ValueError("A review-only decision cannot change publication state")
    outcome = "hidden" if actionable and targets and not unresolved else "review"
    if decision.kind in {"technical", "untrusted"}:
        outcome = "ignored"
    values = [event_hash, decision.kind, decision.reason, decision.case_id, decision.notice_id,
              json.dumps(decision.urls), json.dumps(targets), json.dumps(unresolved), outcome]
    literals = [sql_text(value) for value in values]
    sql = ["START TRANSACTION;", f"""INSERT INTO dmca_mail_events
      (event_hash,mailbox_uid,decision,reason,case_id,notice_id,urls,targets,unresolved_urls,outcome)
      VALUES ({literals[0]},{int(uid)},{','.join(literals[1:])});""", "SET @affected=0;"]
    for target in targets:
        table = {"creator": "creators", "photo": "photos"}[target["kind"]]
        sql.append(f"UPDATE {table} SET is_hidden=1, removed_from_index_at=COALESCE(removed_from_index_at,NOW()) WHERE id={sql_text(target['id'])};")
        sql.append("SET @affected=@affected+ROW_COUNT();")
    sql.extend([f"UPDATE dmca_mail_events SET affected_rows=@affected WHERE event_hash={literals[0]};", "COMMIT;", "SELECT @affected;"])
    output = mysql("\n".join(sql)).strip().splitlines()
    return int(output[-1]) if output else 0


def main(dry_run=False, since_uid=None, bind_mailbox=False):
    if not GMAIL_USER or not GMAIL_APP_PW:
        raise RuntimeError("Missing Gmail configuration")
    if since_uid is not None and not dry_run:
        raise ValueError("Historical scans are only available with --dry-run")
    if bind_mailbox and (dry_run or since_uid is not None):
        raise ValueError("--bind-mailbox cannot scan or process emails")
    last_uid = load_last_uid() if since_uid is None else max(since_uid, 0)
    known = set()
    if not dry_run and not bind_mailbox:
        ensure_schema()
        known = known_event_hashes()
    mailbox = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=30)
    new, duplicates = 0, 0
    try:
        mailbox.login(GMAIL_USER, GMAIL_APP_PW)
        folder = pick_all_mail(mailbox)
        if not folder:
            if mailbox.select("INBOX", readonly=True)[0] != "OK":
                raise RuntimeError("Cannot select Gmail inbox")
            folder = "INBOX"
        if not dry_run:
            verify_mailbox_binding(mailbox, folder, bind=bind_mailbox)
        if bind_mailbox:
            print(f"Mailbox bound to existing cursor UID {last_uid}; no email processed")
            return
        criteria = f'(UID {last_uid + 1}:* OR FROM "legalremovals@google.com" FROM "sc-noreply@google.com")'
        status, result = mailbox.uid("search", None, criteria)
        if status != "OK":
            raise RuntimeError("IMAP UID search failed")
        ids = sorted({int(uid) for uid in (result[0].split() if result and result[0] else []) if int(uid) > last_uid})[:200]
        print(f"Google emails pending: {len(ids)}; dry_run={dry_run}")
        for uid in ids:
            status, data = mailbox.uid("fetch", str(uid).encode(), "(BODY.PEEK[])")
            if status != "OK" or not data or not isinstance(data[0], tuple):
                raise RuntimeError(f"Cannot fetch email UID {uid}")
            raw = data[0][1]
            if len(raw) > 4 * 1024 * 1024:
                raise RuntimeError(f"Email UID {uid} exceeds size limit; review required")
            fingerprint = hashlib.sha256(raw).hexdigest()
            if fingerprint in known:
                duplicates += 1
            else:
                decision = parse_message(email.message_from_bytes(raw))
                targets, unresolved = [], []
                if decision.kind == "removal":
                    resolved = {}
                    for url in decision.urls:
                        matches = resolve_url(url)
                        if not matches:
                            unresolved.append(url)
                        for target in matches:
                            resolved[(target["kind"], target["id"])] = target
                    targets = list(resolved.values())
                changed = 0 if dry_run else record_event(fingerprint, uid, decision, targets, unresolved)
                print(f"UID {uid}: {decision.kind}, reason={decision.reason}, matched={len(targets)}, unresolved={len(unresolved)}, changed={changed}")
                known.add(fingerprint)
                new += 1
            if not dry_run:
                save_last_uid(uid)
    finally:
        mailbox.logout()
    print(f"DONE: {new} decisions; {duplicates} duplicates; no URL rotation or Google submission")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--since-uid", type=int)
    parser.add_argument("--bind-mailbox", action="store_true")
    args = parser.parse_args()
    main(dry_run=args.dry_run, since_uid=args.since_uid, bind_mailbox=args.bind_mailbox)
