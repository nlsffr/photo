"""Pure matching for recorded withdrawals during new ingestion.

Kept independent from the deployed restoration tools so either can roll back alone.
"""
import html
import json
import re
from urllib.parse import unquote, urlsplit


def notice_matches(row, notice):
    strings = []

    def visit(value):
        if isinstance(value, dict):
            if value.get('kind') == 'creator' and (
                str(value.get('handle') or value.get('creator_handle') or '').casefold() == row['handle'].casefold()
                or (row.get('creator_id') and str(value.get('id') or value.get('creator_id')) == str(row['creator_id']))
            ):
                return True
            return any(visit(v) for v in value.values())
        if isinstance(value, list):
            return any(visit(v) for v in value)
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except (ValueError, TypeError):
                strings.append(html.unescape(value.replace('\\/', '/')))
                return False
            return visit(parsed)
        return False

    if any(visit(notice.get(field)) for field in ('urls', 'targets')):
        return True
    profile = re.compile(re.escape(row['handle']) + r'(?:-v[1-9][0-9]*)?', re.I)
    media = re.compile(re.escape(str(row['source_id'])) + r'(?:-v[1-9][0-9]*)?(?:\.[a-zA-Z0-9]+)?')
    for text in strings:
        if row.get('id') and str(row['id']) in unquote(text):
            return True
        for url in re.findall(r'https?://[^\s"<>\\\]\[}]+', text):
            parsed = urlsplit(url)
            if parsed.hostname not in ('leakfanhub.com', 'www.leakfanhub.com'):
                continue
            parts = unquote(parsed.path).strip('/').split('/')
            if parts[0] in ('fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'hi', 'th'):
                parts = parts[1:]
            if parts and profile.fullmatch(parts[0]) and (
                len(parts) == 1 or (len(parts) == 2 and media.fullmatch(parts[1]))
            ):
                return True
    return False
