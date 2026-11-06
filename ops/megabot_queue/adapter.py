"""Run a bounded, resumable profile using the existing ingestion pipeline.

One adapter invocation per OS process: the legacy module's Config is global.
The supervisor must pin source_path's digest and keep legacy workers separate.
"""

from contextlib import ExitStack, contextmanager
import fcntl
import hashlib
import importlib.util
import logging
import os
from pathlib import Path
import random
import re
import time
from urllib.parse import quote, urlsplit

from . import integrity, notices


class RetryableError(RuntimeError):
    """No checkpoint was advanced for the failed page."""


class MediaLockBusy(RetryableError):
    """A stripe is busy and this profile should retry its current page."""


class MissingMedia(RuntimeError):
    """The details endpoint confirms absence; skip only this refresh pass."""


class StorageFull(RuntimeError):
    """The existing storage limit has been reached."""


class Excluded(RuntimeError):
    """The profile is absent or no longer eligible for ingestion."""


class MediaExcluded(RuntimeError):
    """A recorded withdrawal excludes this media from new publication."""


def direct_cdn_url(url):
    """Only the measured file CDN is eligible; API routing stays unchanged."""
    try:
        parsed = urlsplit(url)
        return (isinstance(url, str) and not any(c in url for c in '\r\n\t')
                and parsed.scheme == 'https' and parsed.hostname == 'cdn.leakgallery.com'
                and parsed.port in (None, 443) and parsed.username is None and parsed.password is None)
    except (TypeError, ValueError):
        return False


def download_cdn(bot, url, destination, *, video=None):
    """Try direct once, then the two historical proxy attempts, without redirects."""
    destination = Path(destination)
    temporary = destination.with_suffix(destination.suffix + '.part')
    limit = 2 * 1024**3  # Same maximum as integrity.validate_file, enforced before disk writes.
    # Empty values override Requests' environment AND session proxy defaults.
    direct = dict.fromkeys(('http', 'https', 'all', 'https://cdn.leakgallery.com',
                            'all://cdn.leakgallery.com'), '')
    for attempt in range(3):
        try:
            proxies = direct if attempt == 0 else dict(bot.get_proxy() or {})
            if attempt and ('https' in proxies or 'all' in proxies):
                # A stale session host-specific proxy must not override get_proxy().
                proxies.setdefault('https://cdn.leakgallery.com', proxies.get('https', proxies.get('all')))
            with bot.session.get(url, timeout=(5, 30) if attempt == 0 else 60,
                                 stream=True, proxies=proxies, allow_redirects=False,
                                 headers={'Accept-Encoding': 'identity'}) as response:
                if response.status_code != 200 or 'Content-Range' in response.headers:
                    continue
                length = response.headers.get('Content-Length')
                if length is not None:
                    if not re.fullmatch(r'[0-9]+', length) or not 0 < int(length) <= limit:
                        continue
                    length = int(length)
                destination.parent.mkdir(parents=True, exist_ok=True)
                size = 0
                with temporary.open('wb') as stream:
                    for chunk in response.iter_content(chunk_size=8192):
                        size += len(chunk)
                        if size > limit or (length is not None and size > length):
                            raise integrity.InvalidMedia('invalid_downloaded_size')
                        stream.write(chunk)
                if size == 0 or (length is not None and size != length):
                    raise integrity.InvalidMedia('incomplete_download')
                integrity.validate_file(temporary, video=video)
                temporary.replace(destination)
                return True
        except Exception:
            # Legacy exceptions may contain signed URLs; retry without logging them.
            pass
        finally:
            temporary.unlink(missing_ok=True)
    return False


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
    """Exclude the same source ID without waiting behind another transfer."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    digest = int.from_bytes(hashlib.sha256(source_id.encode()).digest()[:2], "big")
    stripe = digest % 64
    sub_stripe = (digest // 64) % 64
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
    # Older workers take the original stripe exclusively, including after rollback.
    with ExitStack() as descriptors:
        for name, mode in (
            (f"media-{stripe:02d}.lock", fcntl.LOCK_SH),
            (f"media-{stripe:02d}-{sub_stripe:02d}.lock", fcntl.LOCK_EX),
        ):
            fd = os.open(directory / name, flags, 0o600)
            descriptors.callback(os.close, fd)
            try:
                fcntl.flock(fd, mode | fcntl.LOCK_NB)
            except BlockingIOError:
                raise MediaLockBusy("media_lock_busy") from None
        yield


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

    def __init__(self, original, handle, storage=None):
        self.original = original
        self.handle = handle
        self.excluded = False
        self.media_excluded = False
        self.storage = storage
        self.creator_id = None
        self.notice_handles = (handle,)

    def __getattr__(self, name):
        return getattr(self.original, name)

    def eligible_id(self, *, locked=False):
        if not locked:
            self.original._ensure()
        cur = self.original.conn.cursor()
        try:
            cur.execute(
                "SELECT c.id FROM creators c "
                "LEFT JOIN creator_import_caps cap ON cap.creator_id=c.id "
                "WHERE c.handle=%s AND c.is_hidden=0 AND c.removed_from_index_at IS NULL "
                "AND cap.creator_id IS NULL LIMIT 1" + (" FOR UPDATE" if locked else ""),
                (self.handle,),
            )
            row = cur.fetchone()
            if row is None:
                self.excluded = True
                raise Excluded("profile_excluded")
            self.creator_id = row[0]
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

    def assert_media_allowed(self, source_id, *, photo_id=None, creator_id=None):
        rows = [{'id': photo_id, 'source_id': source_id, 'handle': handle,
                 'creator_id': creator_id or self.creator_id}
                for handle in self.notice_handles]
        cur = self.original.conn.cursor(dictionary=True)
        try:
            for table, fields in [('dmca_notices', 'urls'), ('dmca_mail_events', 'urls,targets')]:
                cur.execute('SELECT ' + fields + ' FROM ' + table)
                if any(notices.notice_matches(row, notice) for notice in cur.fetchall() for row in rows):
                    self.media_excluded = True
                    raise MediaExcluded('notice_excluded')
        finally:
            cur.close()

    def assert_source_identity(self, details):
        """An explicitly configured importer may require stronger identity evidence."""

    def before_photo_commit(self, photo_id, creator_id):
        """Run importer-specific checks while the same creator remains locked."""

    def insert_photo(self, photo_id, creator_id, *args, **kwargs):
        if self.storage is not None:
            names = ('source_id', 'title', 'image_url', 'video_url', 'media_type', 'tags',
                     'views', 'likes', 'width', 'height', 'duration', 'is_ai', 'file_size', 'handle', 'minio_key')
            values = {**dict(zip(names, args)), **kwargs}
            try:
                self.storage.verify_publication(*(values[key] for key in (
                    'source_id', 'image_url', 'video_url', 'media_type', 'file_size', 'handle', 'minio_key')))
            except (KeyError, integrity.InvalidMedia):
                raise RetryableError('publication_assets_not_verified') from None
        # Hold the eligibility row until both photos and bot_ingested commit.
        self.original._ensure()
        connection = self.original.conn
        connection.start_transaction()
        ensure = self.original._ensure
        try:
            if self.eligible_id(locked=True) != creator_id:
                self.excluded = True
                raise Excluded("profile_changed")
            if self.storage is not None:
                self.assert_media_allowed(values['source_id'], photo_id=photo_id, creator_id=creator_id)
            def ensure_transaction():
                if self.original.conn is not connection or not connection.is_connected():
                    raise RetryableError("database_transaction_lost")
            # Reconnecting inside this transaction would silently lose its lock.
            self.original._ensure = ensure_transaction
            result = self.original.insert_photo(photo_id, creator_id, *args, **kwargs)
            self.before_photo_commit(photo_id, creator_id)
            connection.commit()
            return result
        except BaseException:
            connection.rollback()
            raise
        finally:
            self.original._ensure = ensure


def run_profile(handle, next_page=1, empty_streak=0, checkpoint=None, *,
                source_path="/opt/megabot/megabot.py", download_dir=None,
                lock_dir="/var/lib/megabot-queue/media-locks", max_pages=10,
                max_new=None, database_factory=None):
    """Process at most ten pages; checkpoint only entirely successful pages.

    checkpoint(next_page, empty_streak) must durably save under the job owner.
    Network errors and partial page failures raise RetryableError. The caller
    should delay retrying the same checkpoint, rather than mark it completed.
    An explicit max_new counts committed items and leaves its last page
    uncheckpointed. A retry must recalculate its remaining budget.
    """
    if not isinstance(handle, str) or not handle or not callable(checkpoint):
        raise ValueError("handle and a durable checkpoint callback are required")
    if not isinstance(next_page, int) or next_page < 1 or empty_streak not in (0, 1, 2):
        raise ValueError("invalid pagination checkpoint")
    if not isinstance(max_pages, int) or not 1 <= max_pages <= 10:
        raise ValueError("max_pages must be between 1 and 10")
    if max_new is not None and (type(max_new) is not int or max_new < 1):
        raise ValueError("max_new must be a positive integer")
    if database_factory is not None and not callable(database_factory):
        raise ValueError("database_factory must be callable")
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

        def download(self, url, destination):
            main = self.current_media is not None and Path(destination).stem == self.current_media[0]
            cdn = direct_cdn_url(url)
            success = (download_cdn(self, url, destination, video=self.current_media[1] if main else None)
                       if cdn else super().download(url, destination))
            if success and self.current_media is not None:
                sid, is_video = self.current_media
                if Path(destination).stem == sid:
                    if not cdn:  # CDN transfer already validated the .part before promotion.
                        integrity.validate_file(destination, video=is_video)
                    if is_video:
                        integrity.make_poster(destination, Path(destination).with_name(sid + '_thumb.webp'))
            return success

        def process_post(self, post):
            source_id = str(post.get("id") or post.get("media_id") or "")
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", source_id):
                raise RetryableError("invalid_media_id")
            # A known media only needs a read. Recheck misses under the lock before publishing.
            if self.db.already_ingested(source_id):
                self.db.eligible_id()
                self.total_skipped += 1
                return
            with media_lock(lock_dir, source_id):
                self.db.eligible_id()
                if self.db.already_ingested(source_id):
                    self.total_skipped += 1
                    return
                self.db.media_excluded = False
                try:
                    self.db.assert_media_allowed(source_id)
                except MediaExcluded:
                    self.total_skipped += 1
                    self.notice_skipped += 1
                    return
                self.detail_cache = {}
                try:
                    details = self.fetch_details(source_id)
                except MissingMedia:
                    self.total_skipped += 1
                    self.unavailable_skipped += 1
                    return
                reported_id = details.get('id') if details.get('id') is not None else details.get('media_id')
                if reported_id is None or str(reported_id) != source_id:
                    raise RetryableError('details_identity_mismatch')
                self.db.assert_source_identity(details)
                if source.extract_handle(details).casefold() != handle.casefold():
                    self.foreign_skipped += 1
                    self.total_skipped += 1
                    return
                if any(details.get(field) for field in ('removed', 'is_removed', 'is_hidden', 'removed_at')):
                    self.total_skipped += 1
                    self.unavailable_skipped += 1
                    return
                merged = {**post, **details}
                is_video = integrity.video_flag(merged.get('is_video'), merged.get('file_path') or merged.get('url') or '')
                # The local video download produces a verified WebP; do not replace it with an unchecked remote thumbnail.
                self.detail_cache[source_id] = {**details, 'is_video': is_video, 'thumbnail_path': ''}
                self.current_media = (source_id, is_video)
                self.r2.uploaded.clear()
                before = self.total_errors
                super().process_post(post)
                self.current_media = None
                if self.db.excluded:
                    raise Excluded("profile_excluded")
                if self.db.media_excluded:
                    self.total_errors = before
                    self.total_skipped += 1
                    self.notice_skipped += 1
                    return
                if self.total_errors != before:
                    raise RetryableError("media_processing_failed")

    bot = None
    try:
        bot = QueuedBot.__new__(QueuedBot)
        bot.__init__()
        original_store = bot.r2
        bot.r2 = integrity.VerifiedStorage(original_store.client, original_store.bucket,
                                          source.Config.PUBLIC_MEDIA_BASE,
                                          before_write=lambda: bot.db.assert_media_allowed(bot.current_media[0]))
        factory = EligibleDatabase if database_factory is None else database_factory
        bot.db = factory(bot.db, handle, bot.r2)
        bot.current_media = None
        bot.detail_cache = {}
        bot.foreign_skipped = 0
        bot.unavailable_skipped = 0
        bot.notice_skipped = 0
        bot.db.eligible_id()
        if bot.db.total_storage_bytes() >= source.Config.MAX_STORAGE_TB * 1024**4:
            raise StorageFull("storage_limit_reached")
        status = "continue"
        for _ in range(max_pages):
            if empty_streak >= 2:
                break
            if next_page > 200:
                raise RetryableError("pagination_limit")
            bot.db.eligible_id()
            posts = bot.fetch_profile_page(handle, next_page)
            if posts:
                busy = False
                for post in posts:
                    try:
                        bot.process_post(post)
                    except MediaLockBusy:
                        busy = True
                        continue
                    if max_new is not None and bot.total_new >= max_new:
                        status = "capped"
                        break
                if status == "capped":
                    break
                if busy:
                    raise MediaLockBusy("media_lock_busy")
                empty_streak = 0
            else:
                empty_streak += 1
            next_page += 1
            checkpoint(next_page, empty_streak)
            if empty_streak < 2:
                time.sleep(random.uniform(source.Config.DELAY_MIN, source.Config.DELAY_MAX))
        return {"status": "done" if empty_streak >= 2 else status,
                "next_page": next_page, "empty_streak": empty_streak,
                "new": bot.total_new, "skipped": bot.total_skipped,
                "errors": bot.total_errors, "foreign_skipped": bot.foreign_skipped,
                "unavailable_skipped": bot.unavailable_skipped, "notice_skipped": bot.notice_skipped}
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
