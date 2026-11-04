"""Exercise the real pure notice matchers; never import a worker or contact data services."""
import ast
import html
import json
from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urlsplit

SITE = Path(__file__).resolve().parents[1]
LOCALES = ('en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'hi', 'th')


def load_functions(path, names):
    """Compile only selected definitions from production, not its imports/main/classes."""
    source = ast.parse((SITE / path).read_text(), filename=path)
    definitions = [node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in names]
    if {node.name for node in definitions} != set(names):
        raise AssertionError('notice function missing')
    scope = {'html': html, 'json': json, 're': re, 'unquote': unquote, 'urlsplit': urlsplit}
    exec(compile(ast.Module(body=definitions, type_ignores=[]), path, 'exec'), scope)
    return {name: scope[name] for name in names}


QUEUE = load_functions('ops/megabot_queue/notices.py', ('notice_matches',))
REPAIR = load_functions('ops/repair-missing-video-assets.py', ('creator_notice_matches', 'notice_matches'))
ROW = {'id': 'opaque-fixture-row', 'source_id': '1234', 'handle': 'example_creator', 'creator_id': 'fixture-creator-id'}


class NoticeLocaleExpansionTests(unittest.TestCase):
    def test_python_scope_covers_exactly_the_twelve_web_locales(self):
        source = (SITE / 'src/lib/i18n/config.ts').read_text()
        value = re.search(r'export const LOCALES = (\[[^;]+\]) as const;', source)
        self.assertIsNotNone(value)
        self.assertEqual(json.loads(value.group(1)), list(LOCALES))

    def test_all_localized_profile_urls_and_versions_remain_withdrawn(self):
        for name, matcher in [('queue', QUEUE['notice_matches']), ('repair-creator', REPAIR['creator_notice_matches']), ('repair', REPAIR['notice_matches'])]:
            for locale in LOCALES:
                for version in ('', '-v23'):
                    for host in ('leakfanhub.com', 'www.leakfanhub.com'):
                        url = f'https://{host}/{locale}/example_creator{version}?source=notice#profile'
                        with self.subTest(matcher=name, locale=locale, version=version, host=host):
                            self.assertTrue(matcher(ROW, {'urls': json.dumps([url])}))

    def test_all_localized_media_urls_preserve_exact_source_id_and_media_version(self):
        for name, matcher in [('queue', QUEUE['notice_matches']), ('repair', REPAIR['notice_matches'])]:
            for locale in LOCALES:
                for suffix in ('', '-v23', '-v23.mp4'):
                    url = f'https://leakfanhub.com/{locale}/example_creator/1234{suffix}'
                    with self.subTest(matcher=name, locale=locale, suffix=suffix):
                        self.assertTrue(matcher(ROW, {'urls': json.dumps([url]).replace('/', '\\/')}))
                for handle, source_id in [('example_creator', '12345'), ('example_creator_extra', '1234'), ('other_creator', '1234')]:
                    with self.subTest(matcher=name, locale=locale, wrong=(handle, source_id)):
                        self.assertFalse(matcher(ROW, {'urls': f'https://leakfanhub.com/{locale}/{handle}/{source_id}-v23'}))

    def test_media_notice_never_becomes_a_creator_wide_notice(self):
        for locale in LOCALES:
            with self.subTest(locale=locale):
                self.assertFalse(REPAIR['creator_notice_matches'](ROW, {'urls': f'https://leakfanhub.com/{locale}/example_creator/1234-v23'}))

    def test_profile_notices_keep_exact_site_host_checks(self):
        for name, matcher in [('queue', QUEUE['notice_matches']), ('repair-creator', REPAIR['creator_notice_matches']), ('repair', REPAIR['notice_matches'])]:
            for locale in LOCALES:
                for host in ('unrelated.invalid', 'leakfanhub.com.attacker.invalid', 'www.leakfanhub.com.attacker.invalid', 'leakfanhub.com@attacker.invalid'):
                    with self.subTest(matcher=name, locale=locale, host=host):
                        self.assertFalse(matcher(ROW, {'urls': f'https://{host}/{locale}/example_creator-v23'}))
        # The ingestion matcher also has an explicit host guard for media URLs.
        # The repair's pre-existing conservative text fallback is a separate rule.
        for locale in LOCALES:
            self.assertFalse(QUEUE['notice_matches'](ROW, {'urls': f'https://attacker.invalid/{locale}/example_creator/1234-v23'}))

    def test_nested_languages_are_not_promoted_to_creator_scope_or_ingestion_media_scope(self):
        for locale in LOCALES:
            for path in (f'/{locale}/fr/example_creator-v23', f'/fr/{locale}/example_creator-v23'):
                notice = {'urls': 'https://leakfanhub.com' + path}
                with self.subTest(path=path):
                    self.assertFalse(QUEUE['notice_matches'](ROW, notice))
                    self.assertFalse(REPAIR['creator_notice_matches'](ROW, notice))
                    self.assertFalse(REPAIR['notice_matches'](ROW, notice))
            self.assertFalse(QUEUE['notice_matches'](ROW, {'urls': f'https://leakfanhub.com/{locale}/fr/example_creator/1234-v23'}))

    def test_structured_creator_targets_and_bare_legacy_urls_are_unchanged(self):
        notices = [
            {'targets': [{'kind': 'creator', 'handle': 'EXAMPLE_CREATOR'}]},
            {'targets': [{'kind': 'creator', 'id': 'fixture-creator-id'}]},
            {'urls': 'https://leakfanhub.com/example_creator-v23'},
            {'urls': 'https://leakfanhub.com/%72%75/example_creator-v23?x=1&amp;y=2'},
        ]
        for matcher in (QUEUE['notice_matches'], REPAIR['creator_notice_matches'], REPAIR['notice_matches']):
            for notice in notices:
                self.assertTrue(matcher(ROW, notice), notice)
            for notice in ({'targets': [{'kind': 'creator', 'handle': 'someone_else'}]}, {'urls': 'https://leakfanhub.com/'}, {'urls': 'https://leakfanhub.com/example_creator_extra'}):
                self.assertFalse(matcher(ROW, notice), notice)


if __name__ == '__main__':
    unittest.main()
