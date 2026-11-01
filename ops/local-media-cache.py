"""Copy an exact, bounded local original into a repairer's private workspace.

This helper grants no publication permission. Callers must validate current
source identity, ownership and withdrawals first, then validate the copied media.
The original cache is read-only and is never renamed, modified or removed.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import stat


def fingerprint(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns)


def valid_signature(data, extension):
    extension = extension.lower()
    if extension in ('.jpg', '.jpeg'):
        return data.startswith(b'\xff\xd8\xff')
    if extension == '.png':
        return data.startswith(b'\x89PNG\r\n\x1a\n')
    if extension == '.webp':
        return data.startswith(b'RIFF') and data[8:12] == b'WEBP'
    if extension == '.webm':
        return data.startswith(b'\x1aE\xdf\xa3')
    return data[4:8] in (b'ftyp', b'wide', b'free', b'mdat')


def copy_media(source_id, extension, destination, *, expected_size, limit):
    root = os.environ.get('MEDIA_REPAIR_LOCAL_CACHE')
    if (not root or type(source_id) not in (str, int)
            or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', str(source_id))
            or not isinstance(extension, str)
            or extension.lower() not in ('.mp4', '.mov', '.m4v', '.webm', '.jpg', '.jpeg', '.png', '.webp')
            or type(expected_size) is not int or expected_size <= 0
            or type(limit) is not int or not 0 < expected_size <= limit):
        return None
    root_fd = source_fd = target_fd = None
    created = False
    destination = Path(destination)
    try:
        root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        filename = str(source_id)+extension
        before = os.stat(filename, dir_fd=root_fd, follow_symlinks=False)
        if not stat.S_ISREG(before.st_mode) or before.st_size != expected_size:
            return None
        source_fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root_fd)
        opened = os.fstat(source_fd)
        if fingerprint(opened) != fingerprint(before) or not stat.S_ISREG(opened.st_mode):
            return None
        target_fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        created = True
        size = 0
        digest = hashlib.sha256()
        while True:
            block = os.read(source_fd, min(1024**2, expected_size-size+1))
            if not block:
                break
            if size == 0 and not valid_signature(block[:32], extension):
                return None
            size += len(block)
            if size > expected_size or size > limit:
                return None
            digest.update(block)
            pending = memoryview(block)
            while pending:
                written = os.write(target_fd, pending)
                if written <= 0:
                    return None
                pending = pending[written:]
        after = os.stat(filename, dir_fd=root_fd, follow_symlinks=False)
        if (size != expected_size or fingerprint(os.fstat(source_fd)) != fingerprint(before)
                or fingerprint(after) != fingerprint(before)):
            return None
        created = False  # Ownership of this private copy passes to the caller.
        return {'bytes': size, 'sha256': digest.hexdigest()}
    except OSError:
        return None
    finally:
        for fd in (target_fd, source_fd, root_fd):
            if fd is not None:
                os.close(fd)
        if created:
            destination.unlink(missing_ok=True)
