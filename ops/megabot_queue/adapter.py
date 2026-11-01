"""Run a bounded, resumable profile using the existing ingestion pipeline.

One adapter invocation per OS process: the legacy module's Config is global.
The supervisor must pin source_path's digest and keep legacy workers separate.
"""

from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import logging
import os
from pathlib import Path
import random
import re
import time
from urllib.parse import quote


class RetryableError(RuntimeError):
    """No checkpoint was advanced for the failed page."""


class MissingMedia(RuntimeError):
    """The details endpoint confirms absence; skip only this refresh pass."""


class StorageFull(RuntimeError):
    """The existing storage limit has been reached."""


class Excluded(RuntimeError):
    """The profile is absent or no longer eligible for ingestion."""


def load_source(path):
    spec = importlib.util.spec_from_file_location("_megabot_queue_legacy", path)
    if spec is None or spec.loader is None:
        raise RetryableError("source_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Legacy messages contain full media URLs; queue logs only expose counters.
    silent = logging.getLogger("megabot_queue.legacy")
    silent.disabled = True
    module.logger = silent
    return module


@contextmanager
def media_lock(directory, source_id):
    """Shared fixed-size lock set: equal source IDs always use the same lock."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    stripe = int.from_bytes(hashlib.sha256(source_id.encode()).digest()[:2], "big") % 64
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
    fd = os.open(directory / f"media-{stripe:02d}.lock", flags, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def request_json(bot, url, *, profile=False):
    try:
        response = bot.session.get(
            url, timeout=20 if profile else 15, proxies=bot.get_proxy(),
            **({"params": {"type": "All", "sort": "MostRecent"}} if profile else {}),
        )
        if response.status_code == 404:
            if profile:
                return []
            raise MissingMedia("media_unavailable")
        if response.status_code != 200:
            raise RetryableError(f"http_{response.status_code}")
        data = response.json()
    except (RetryableError, MissingMedia):
        raise
    except Exception:
        # Do not expose exception messages, which can include signed URLs.
        raise RetryableError("request_or_json_failed") from None
    if not profile:
        if not isinstance(data, dict) or data.get("error") or data.get("errors"):
            raise RetryableError("invalid_details")
        return data
    if isinstance(data, dict):
        if data.get("error") or data.get("errors"):
            raise RetryableError("invalid_profile_page")
        lists = [data[key] for key in ("medias", "data", "posts") if isinstance(data.get(key), list)]
        if lists and any(value != lists[0] for value in lists[1:]):
            raise RetryableError("ambiguous_profile_page")
        if lists:
            data = lists[0]
    if not isinstance(data, list) or any(not isinstance(post, dict) for post in data):
        raise RetryableError("invalid_profile_page")
    return data


class EligibleDatabase:
    """Delegate media insertion, but never insert/re-enable a creator."""

    def __init__(self, original, handle):
        self.original = original
        self.handle = handle
        self.excluded = False

    def __getattr__(self, name):
        return getattr(self.original, name)

    def eligible_id(self, *, locked=False):
        if not locked:
            self.original._ensure()
        cur = self.original.conn.cursor()
        try:
            cur.execute(
                "SELECT id FROM creators WHERE handle=%s AND is_hidden=0 "
                "AND removed_from_index_at IS NULL LIMIT 1" + (" FOR UPDATE" if locked else ""),
                (self.handle,),
            )
            row = cur.fetchone()
            if row is None:
                self.excluded = True
                raise Excluded("profile_excluded")
            return row[0]
        finally:
            cur.close()

    def upsert_creator(self, handle, name=None, avatar_url=None, followers=0):
        if str(handle).casefold() != self.handle.casefold():
            raise RetryableError("unexpected_profile")
        creator_id = self.eligible_id()
        cur = self.original.conn.cursor()
        try:
            if followers > 0:
                cur.execute(
                    "UPDATE creators SET followers_count=%s WHERE id=%s AND is_hidden=0 "
                    "AND removed_from_index_at IS NULL", (followers, creator_id),
                )
            if avatar_url:
                cur.execute(
                    "UPDATE creators SET avatar_url=%s WHERE id=%s AND (avatar_url IS NULL OR avatar_url='') "
                    "AND is_hidden=0 AND removed_from_index_at IS NULL", (avatar_url, creator_id),
                )
        finally:
            cur.close()
        return creator_id

    def insert_photo(self, photo_id, creator_id, *args, **kwargs):
        # Hold the eligibility row until both photos and bot_ingested commit.
        self.original._ensure()
        connection = self.original.conn
        connection.start_transaction()
        ensure = self.original._ensure
        try:
            if self.eligible_id(locked=True) != creator_id:
                self.excluded = True
                raise Excluded("profile_changed")
            def ensure_transaction():
                if self.original.conn is not connection or not connection.is_connected():
                    raise RetryableError("database_transaction_lost")
            # Reconnecting inside this transaction would silently lose its lock.
            self.original._ensure = ensure_transaction
            result = self.original.insert_photo(photo_id, creator_id, *args, **kwargs)
            connection.commit()
            return result
        except BaseException:
            connection.rollback()
            raise
        finally:
            self.original._ensure = ensure


def run_profile(handle, next_page=1, empty_streak=0, checkpoint=None, *,
                source_path="/opt/megabot/megabot.py", download_dir=None,
                lock_dir="/var/lib/megabot-queue/media-locks", max_pages=10):
    """Process at most ten pages; checkpoint only entirely successful pages.

    checkpoint(next_page, empty_streak) must durably save under the job owner.
    Network errors and partial page failures raise RetryableError. The caller
    should delay retrying the same checkpoint, rather than mark it completed.
    """
    if not isinstance(handle, str) or not handle or not callable(checkpoint):
        raise ValueError("handle and a durable checkpoint callback are required")
    if not isinstance(next_page, int) or next_page < 1 or empty_streak not in (0, 1, 2):
        raise ValueError("invalid pagination checkpoint")
    if not isinstance(max_pages, int) or not 1 <= max_pages <= 10:
        raise ValueError("max_pages must be between 1 and 10")
    if next_page > 200 and empty_streak < 2:
        raise RetryableError("pagination_limit")
    source = load_source(str(source_path))
    source.Config.DOWNLOAD_DIR = Path(download_dir) if download_dir else (
        Path(source.Config.DOWNLOAD_DIR) / "queue" / str(os.getpid())
    )

    class QueuedBot(source.MegaBot):
        def fetch_profile_page(self, current_handle, page):
            return request_json(self, f"{source.Config.BASE_URL}/profile/{quote(current_handle, safe='')}/{page}", profile=True)

        def fetch_details(self, media_id):
            if media_id not in self.detail_cache:
                time.sleep(source.Config.DETAILS_DELAY)
                self.detail_cache[media_id] = request_json(
                    self, f"{source.Config.BASE_URL}/media/{quote(media_id, safe='')}",
                )
            return self.detail_cache[media_id]

        def process_post(self, post):
            source_id = str(post.get("id") or post.get("media_id") or "")
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", source_id):
                raise RetryableError("invalid_media_id")
            with media_lock(lock_dir, source_id):
                self.db.eligible_id()
                if self.db.already_ingested(source_id):
                    self.total_skipped += 1
                    return
                self.detail_cache = {}
                try:
                    details = self.fetch_details(source_id)
                except MissingMedia:
                    self.total_skipped += 1
                    self.unavailable_skipped += 1
                    return
                if source.extract_handle({**post, **details}).casefold() != handle.casefold():
                    self.foreign_skipped += 1
                    self.total_skipped += 1
                    return
                before = self.total_errors
                super().process_post(post)
                if self.db.excluded:
                    raise Excluded("profile_excluded")
                if self.total_errors != before:
                    raise RetryableError("media_processing_failed")

    bot = None
    try:
        bot = QueuedBot.__new__(QueuedBot)
        bot.__init__()
        bot.db = EligibleDatabase(bot.db, handle)
        bot.detail_cache = {}
        bot.foreign_skipped = 0
        bot.unavailable_skipped = 0
        bot.db.eligible_id()
        if bot.db.total_storage_bytes() >= source.Config.MAX_STORAGE_TB * 1024**4:
            raise StorageFull("storage_limit_reached")
        for _ in range(max_pages):
            if empty_streak >= 2:
                break
            if next_page > 200:
                raise RetryableError("pagination_limit")
            bot.db.eligible_id()
            posts = bot.fetch_profile_page(handle, next_page)
            if posts:
                for post in posts:
                    bot.process_post(post)
                empty_streak = 0
            else:
                empty_streak += 1
            next_page += 1
            checkpoint(next_page, empty_streak)
            if empty_streak < 2:
                time.sleep(random.uniform(source.Config.DELAY_MIN, source.Config.DELAY_MAX))
        return {"status": "done" if empty_streak >= 2 else "continue",
                "next_page": next_page, "empty_streak": empty_streak,
                "new": bot.total_new, "skipped": bot.total_skipped,
                "errors": bot.total_errors, "foreign_skipped": bot.foreign_skipped,
                "unavailable_skipped": bot.unavailable_skipped}
    except (RetryableError, StorageFull, Excluded):
        raise
    except Exception:
        raise RetryableError("profile_execution_failed") from None
    finally:
        if bot is not None:
            try:
                if hasattr(bot, "db"):
                    bot.db.close()
            except Exception:
                pass
            try:
                if hasattr(bot, "session"):
                    bot.session.close()
            except Exception:
                pass
