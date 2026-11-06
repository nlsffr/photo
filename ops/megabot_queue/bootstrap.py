"""Stage and publish one privately approved creator, with a 15-media limit."""

import argparse
from collections import Counter
from contextlib import closing, contextmanager, redirect_stderr, redirect_stdout
import fcntl
from hashlib import sha256
from http.client import HTTPConnection, HTTPException
import json
import os
from pathlib import Path
import re
import shutil
import stat
import time
from uuid import UUID, uuid5

from .adapter import EligibleDatabase, Excluded, MediaExcluded, RetryableError, StorageFull, load_source, run_profile
from .supervisor import legacy_processes, read_config, source_environment, status as queue_status, verified_source


MAX_MEDIA = 15
MIN_STAGING_FREE = 12 * 1024**3  # Four queue slots, one bootstrap, and 2 GiB headroom.
NAMESPACE = UUID("21e80f4e-09b2-4f4b-960a-b9f9626b048a")
SOURCE_ORIGIN = "https://api.leakgallery.com"
PUBLIC_MEDIA_BASE = "https://leakfanhub.com/media"
EDGE_MAP = Path("/opt/photo/infra/nginx/generated/removed-media-maps.conf")
HANDLE = re.compile(r"[a-z0-9](?:[a-z0-9._-]{0,98}[a-z0-9])?")
UNAVAILABLE = ("removed", "is_removed", "is_hidden", "removed_at", "removed_from_index_at")


class BootstrapError(RuntimeError):
    """The approved import cannot continue safely."""


def _read_edge_file(path, maximum):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_size > maximum:
            raise OSError("untrusted_edge_map")
        body = stream.read(maximum + 1)
        if len(body) > maximum:
            raise OSError("edge_map_too_large")
        return body


def edge_stage_ready(handle):
    if not handle or canonical(handle) != handle:
        raise BootstrapError("invalid_edge_stage_handle")
    try:
        raw = _read_edge_file(EDGE_MAP, 16 * 1024**2)
        checksum = _read_edge_file(EDGE_MAP.with_suffix(".conf.sha256"), 128)
        if sha256(raw).hexdigest().encode("ascii") != checksum.strip():
            return False

        entry = f'  "{handle}" 1;'.encode("ascii")
        def in_creator_map(name):
            header = b"\nmap $media_creator_path_handle $media_" + name + b"_creator {\n"
            _, start, tail = raw.partition(header)
            body, end, _ = tail.partition(b"\n}\n")
            return bool(start and end and entry in body.splitlines())

        if in_creator_map(b"removed"):
            raise BootstrapError("edge_creator_already_tombstoned")
        if not in_creator_map(b"staged"):
            return False
        with closing(HTTPConnection("127.0.0.1", 80, timeout=2)) as edge:
            edge.request("HEAD", f"/media/creators/{handle}/.lfh-bootstrap-stage-probe",
                         headers={"Host": "leakfanhub.com", "Cache-Control": "no-cache"})
            with closing(edge.getresponse()) as response:
                return (response.status == 410
                        and "no-store" in response.getheader("Cache-Control", "").lower()
                        and "noindex" in response.getheader("X-Robots-Tag", "").lower())
    except (OSError, HTTPException):
        return False


def canonical(value):
    if isinstance(value, str) and value.isascii():
        handle = value.strip().lower()
        if HANDLE.fullmatch(handle) and "..." not in handle and handle != "unknown":
            return handle
    return None


def approved_candidates(document):
    if (not isinstance(document, dict) or type(document.get("schemaVersion")) is not int
            or document["schemaVersion"] != 1 or document.get("source") != "leakgallery"
            or document.get("approvalStatus") != "approved"):
        raise BootstrapError("manifest_not_approved")
    candidates = document.get("candidates")
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= 100:
        raise BootstrapError("invalid_candidates")
    approved, seen = {}, set()
    for item in candidates:
        if (not isinstance(item, dict) or set(item) != {"handle", "aliases", "identityNeedsVerification"}
                or item["identityNeedsVerification"] is not True):
            raise BootstrapError("invalid_candidate")
        handle, aliases = item["handle"], item["aliases"]
        if not isinstance(aliases, list) or len(aliases) > 32:
            raise BootstrapError("invalid_aliases")
        for name in [handle, *aliases]:
            if canonical(name) is None or name != canonical(name) or name in seen:
                raise BootstrapError("ambiguous_identity")
            seen.add(name)
        approved[handle] = tuple(sorted(aliases))
    return approved


def read_approved_manifest(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
        metadata = os.fstat(stream.fileno())
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid()
                or metadata.st_mode & 0o077 or metadata.st_size > 256 * 1024):
            raise BootstrapError("manifest_not_private")
        content = stream.read(256 * 1024 + 1)
    if len(content) > 256 * 1024:
        raise BootstrapError("manifest_too_large")
    return approved_candidates(json.loads(content))


@contextmanager
def bootstrap_lock(state_dir):
    state_dir = Path(state_dir)
    metadata = state_dir.stat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != os.geteuid() or metadata.st_mode & 0o077:
        raise BootstrapError("state_directory_not_private")
    fd = os.open(state_dir / "creator-bootstrap.lock",
                 os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(fd)


class BootstrapDatabase(EligibleDatabase):
    def __init__(self, original, handle, aliases, storage=None, *, related_names=(), state_dir=None):
        super().__init__(original, handle, storage)
        self.aliases = tuple(sorted(aliases))
        self.bootstrap_id = str(uuid5(NAMESPACE, "/".join((handle, *self.aliases))))
        self.notice_handles = tuple(sorted({handle, *self.aliases, *related_names}))
        self.creator_id = self.bootstrap_id
        self.state_dir = state_dir

    def rows(self, sql, params, *, write=False):
        cursor = self.original.conn.cursor()
        try:
            cursor.execute(sql, params)
            return cursor.rowcount if write else cursor.fetchall()
        finally:
            cursor.close()

    def inspect(self, *, locked=False):
        if not locked:
            self.original._ensure()
        placeholders = ",".join(["%s"] * len(self.notice_handles))
        lock = " FOR UPDATE" if locked else ""
        creators = self.rows(
            "SELECT c.id,c.handle,c.is_hidden,c.removed_from_index_at,s.creator_id FROM creators c "
            "LEFT JOIN creator_bootstrap_staging s ON s.creator_id=c.id "
            f"WHERE c.handle IN ({placeholders}) OR c.id=%s" + lock,
            (*self.notice_handles, self.bootstrap_id),
        )
        if creators and creators != [(self.bootstrap_id, self.handle, 1, None, self.bootstrap_id)]:
            return "known"
        history = self.rows(
            "SELECT b.source_id FROM bot_ingested b LEFT JOIN photos p ON p.id=b.photo_id "
            f"WHERE b.creator_handle IN ({placeholders}) "
            "AND (p.creator_id IS NULL OR p.creator_id<>%s) LIMIT 1" + lock,
            (*self.notice_handles, self.bootstrap_id),
        )
        if history:
            return "known"
        return "pending" if creators else "new"

    def eligible_id(self, *, locked=False):
        if self.state_dir is not None:
            check_queue_pause(self.state_dir)
        if self.inspect(locked=locked) != "pending":
            self.excluded = True
            raise Excluded("profile_excluded")
        return self.bootstrap_id

    def assert_source_identity(self, details):
        profile = details.get("profile")
        source_id = details.get("id") if details.get("id") is not None else details.get("media_id")
        if (not isinstance(profile, dict) or canonical(profile.get("username")) != self.handle
                or any(profile.get(field) or details.get(field) for field in UNAVAILABLE)
                or not re.fullmatch(r"[1-9][0-9]{0,18}", str(source_id))
                or int(source_id) > 2**63 - 1
                or "old_usernames" not in profile):
            raise RetryableError("bootstrap_identity_changed")
        old = profile["old_usernames"]
        if old is None or (isinstance(old, str) and not old.strip()):
            values = ()
        elif isinstance(old, str) and len(old) <= 3300:
            values = old.split("/")
        else:
            raise RetryableError("bootstrap_identity_changed")
        aliases = {canonical(value) for value in values} - {self.handle}
        if aliases != set(self.aliases):
            raise RetryableError("bootstrap_identity_changed")

    def upsert_creator(self, handle, name=None, avatar_url=None, followers=0):
        if canonical(handle) != self.handle:
            raise RetryableError("unexpected_profile")
        return self.eligible_id()

    @contextmanager
    def transaction(self):
        self.original._ensure()
        connection = self.original.conn
        connection.start_transaction(isolation_level="READ COMMITTED")
        try:
            yield
            connection.commit()
        except BaseException:
            connection.rollback()
            raise

    def reserve(self):
        with self.transaction():
            status = self.inspect(locked=True)
            if status == "known":
                raise Excluded("profile_excluded")
            self.assert_media_allowed(None)
            if status == "new":
                creator = self.rows(
                    "INSERT INTO creators (id,handle,name,avatar_url,is_hidden) VALUES (%s,%s,%s,'',1)",
                    (self.bootstrap_id, self.handle, self.handle), write=True,
                )
                cap = self.rows(
                    "INSERT INTO creator_import_caps (creator_id) VALUES (%s)",
                    (self.bootstrap_id,), write=True,
                )
                stage = self.rows(
                    "INSERT INTO creator_bootstrap_staging (creator_id) VALUES (%s)",
                    (self.bootstrap_id,), write=True,
                )
                if creator != 1 or cap != 1 or stage != 1:
                    raise BootstrapError("quota_reservation_failed")

    def staged(self, *, locked=False):
        if not locked:
            self.original._ensure()
        rows = self.rows(
            "SELECT p.id,p.source_id,p.is_hidden,p.removed_from_index_at,p.type,b.source_id,s.photo_id "
            "FROM photos p LEFT JOIN bot_ingested b ON b.photo_id=p.id AND b.source_id=p.source_id "
            "AND b.creator_handle=%s LEFT JOIN creator_bootstrap_staged_media s "
            "ON s.photo_id=p.id AND s.creator_id=p.creator_id WHERE p.creator_id=%s LIMIT 16"
            + (" FOR UPDATE" if locked else ""),
            (self.handle, self.bootstrap_id),
        )
        if len(rows) > MAX_MEDIA or any(
                hidden != 1 or removed is not None or kind not in ("photo", "video")
                or source_id is None or registered is None or str(source_id) != str(registered) or marker != photo_id
                for photo_id, source_id, hidden, removed, kind, registered, marker in rows):
            raise BootstrapError("invalid_staged_media")
        cap = self.rows(
            "SELECT admitted FROM creator_import_caps WHERE creator_id=%s" + (" FOR UPDATE" if locked else ""),
            (self.bootstrap_id,),
        )
        if cap != [(len(rows),)]:
            raise BootstrapError("invalid_staged_quota")
        return [(photo_id, source_id) for photo_id, source_id, *_ in rows]

    def before_photo_commit(self, photo_id, creator_id):
        changed = self.rows("UPDATE photos SET is_hidden=1 WHERE id=%s AND creator_id=%s AND is_hidden=0 "
                            "AND removed_from_index_at IS NULL", (photo_id, creator_id), write=True)
        if changed != 1:
            raise BootstrapError("staging_failed")
        if self.rows("INSERT INTO creator_bootstrap_staged_media (photo_id,creator_id) VALUES (%s,%s)",
                     (photo_id, creator_id), write=True) != 1:
            raise BootstrapError("staging_failed")
        self.staged(locked=True)

    def before_storage_write(self, source_id, key):
        prefix = f"creators/{self.handle}/"
        tail = key.removeprefix(prefix) if isinstance(key, str) else ""
        if (self.storage.public_base != PUBLIC_MEDIA_BASE or tail == key or tail in (".", "..")
                or not re.fullmatch(r"[A-Za-z0-9._-]+", tail)):
            raise Excluded("edge_asset_scope_mismatch")
        self.eligible_id()
        super().before_storage_write(source_id, key)

    def activate(self):
        with self.transaction():
            self.eligible_id(locked=True)
            self.assert_media_allowed(None)
            photos = self.staged(locked=True)
            if not photos:
                return 0
            for photo_id, source_id in photos:
                self.assert_media_allowed(source_id, photo_id=photo_id)
                if self.rows("UPDATE photos SET is_hidden=0 WHERE id=%s AND creator_id=%s AND is_hidden=1 "
                             "AND removed_from_index_at IS NULL", (photo_id, self.bootstrap_id), write=True) != 1:
                    raise BootstrapError("activation_changed")
            if self.rows("UPDATE creators SET is_hidden=0 WHERE id=%s AND is_hidden=1 "
                         "AND removed_from_index_at IS NULL", (self.bootstrap_id,), write=True) != 1:
                raise BootstrapError("activation_changed")
            return len(photos)

    def abort(self):
        with self.transaction():
            self.rows("DELETE FROM creator_bootstrap_staging WHERE creator_id=%s", (self.bootstrap_id,), write=True)


def check_queue_pause(state_dir):
    status = queue_status(state_dir)
    if status["pause_kind"] and status.get("pause_until", 0) > time.time():
        if status["pause_kind"] == "storage":
            raise StorageFull("storage_limit_reached")
        raise RetryableError("queue_network_paused")


def check_staging_space(state_dir):
    root = Path(state_dir)
    staging = root / "downloads"
    if shutil.disk_usage(staging if staging.is_dir() else root).free < MIN_STAGING_FREE:
        raise StorageFull("staging_space_low")


def run_candidate(database, *, source_path, state_dir, apply=False):
    state = database.inspect()
    if not apply or state == "known":
        return {"status": state}
    check_queue_pause(state_dir)
    database.reserve()
    if not edge_stage_ready(database.handle):
        return {"status": "stage_pending"}
    page, empty = 1, 0
    state_dir = Path(state_dir)
    # A restart deliberately scans from page one. Committed source IDs are
    # skipped by the adapter and the remaining budget comes from MariaDB.
    while (remaining := MAX_MEDIA - len(database.staged())) > 0:
        result = run_profile(
            database.handle, page, empty, lambda *_: None,
            source_path=source_path,
            lock_dir=state_dir / "media-locks",
            download_dir=state_dir / "downloads" / "creator-bootstrap",
            max_new=remaining,
            database_factory=lambda original, handle, storage: BootstrapDatabase(
                original, handle, database.aliases, storage,
                related_names=database.notice_handles, state_dir=state_dir),
        )
        if result["status"] in ("done", "capped"):
            break
        page, empty = result["next_page"], result["empty_streak"]
    count = database.activate()
    return {"status": "published" if count else "empty", "media": count}


def run_approved(original, candidates, alias_map, config, *, apply=False):
    counts = Counter()
    for handle, aliases in candidates.items():
        related = {handle, *aliases}
        for name, alternatives in alias_map.items():
            names = {canonical(name), *(canonical(alias) for alias in alternatives)}
            if related & names:
                related.update(names - {None})
        database = BootstrapDatabase(original, handle, aliases, related_names=related,
                                     state_dir=config["state_dir"] if apply else None)
        try:
            result = run_candidate(database, source_path=config["source_path"], state_dir=config["state_dir"], apply=apply)
        except (Excluded, MediaExcluded):
            if apply:
                database.abort()
            result = {"status": "excluded"}
        except (BootstrapError, RetryableError) as error:
            if apply and (isinstance(error, BootstrapError) or error.args == ("bootstrap_identity_changed",)):
                database.abort()
            raise
        counts[result["status"]] += 1
        counts["media"] += result.get("media", 0)
    return {"status": "completed" if apply else "preview", "counts": dict(counts)}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="/etc/megabot-queue/config.json")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--handle", help="Process only this approved handle")
    parser.add_argument("--aliases", required=True, help="Repository creator-aliases.json")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    try:
        candidates = read_approved_manifest(args.manifest)
        if args.handle is not None:
            handle = canonical(args.handle)
            candidates = {handle: candidates[handle]}
        alias_map = json.loads(Path(args.aliases).read_text())["aliases"]
        if not isinstance(alias_map, dict) or any(
                not isinstance(aliases, list) or any(not isinstance(alias, str) for alias in aliases)
                for aliases in alias_map.values()):
            raise BootstrapError("invalid_alias_map")
        config = read_config(args.config)
        verified_source(config)
        if args.apply and legacy_processes():
            raise BootstrapError("legacy_workers_active")
        with open(os.devnull, "w") as sink, redirect_stdout(sink), redirect_stderr(sink), source_environment(config["env"]):
            source = load_source(config["source_path"])
            if source.Config.BASE_URL.rstrip("/") != SOURCE_ORIGIN:
                raise BootstrapError("unexpected_source")
            original = source.MariaDB()
            try:
                if args.apply:
                    with bootstrap_lock(config["state_dir"]):
                        check_staging_space(config["state_dir"])
                        result = run_approved(original, candidates, alias_map, config, apply=True)
                else:
                    result = run_approved(original, candidates, alias_map, config)
            finally:
                original.close()
    except (RetryableError, BlockingIOError):
        print(json.dumps({"status": "retry"}))
        return 1
    except StorageFull:
        print(json.dumps({"status": "storage_full"}))
        return 1
    except Exception:
        # Source and database exceptions can carry private URLs or configuration.
        print(json.dumps({"status": "stopped"}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
