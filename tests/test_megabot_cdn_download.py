"""Exercise the queue download boundary with real Requests, without a network."""
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import requests
from requests.adapters import BaseAdapter
from urllib3.response import HTTPResponse

from ops.megabot_queue import adapter
from test_megabot_adapter import source_fixture


CDN = 'https://cdn.leakgallery.com/media/1.png?fixture=1'
PNG = b'\x89PNG\r\n\x1a\n' + b'neutral fixture'
VIDEO = b'\x00\x00\x00\x18ftyp' + b'neutral fixture'
PROXY = {'https': 'socks5h://127.0.0.1:1080'}
PROBE = {'streams': [{'codec_type': 'video', 'codec_name': 'fixture', 'width': 8, 'height': 8}],
         'format': {'duration': '1'}}


class Transport(BaseAdapter):
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.replies = []

    def send(self, request, **kwargs):
        self.calls.append((request, kwargs))
        value = self.responses.pop(0)
        if isinstance(value, Exception):
            raise value
        status, body, headers = value
        response = requests.Response()
        response.status_code, response.url, response.request = status, request.url, request
        response.headers.update(headers)
        response.raw = HTTPResponse(body=io.BytesIO(body if isinstance(body, bytes) else b''), headers=headers, preload_content=False,
                                    enforce_content_length=True)
        if callable(body):
            response.raw.stream = body
        response.connection = self
        self.replies.append(response)
        return response

    def close(self):
        pass


def reply(body=PNG, status=200, **headers):
    return status, body, {'Content-Length': str(len(body)), **headers}


class CdnDownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def exercise(self, responses, *, url=CDN, video=False, initial=None):
        source, state = source_fixture({1: [{'id': '1', 'handle': 'allowed'}]},
                                       {'1': {'is_video': video}})
        session = requests.Session()
        # The direct path must override both environment and session defaults.
        session.proxies.update({'https': 'http://session-proxy.invalid:8000',
                                'https://cdn.leakgallery.com': 'http://host-proxy.invalid:8000'})
        session.headers.update({'User-Agent': 'fixture-agent', 'Referer': 'https://fixture.invalid/'})
        transport = Transport(responses)
        session.mount('https://', transport)
        original_init, original_process = source.MegaBot.__init__, source.MegaBot.process_post
        destination = self.directory / 'downloads' / ('1.mp4' if video else '1.png')
        if initial is not None:
            destination.parent.mkdir()
            destination.write_bytes(initial)

        def init(bot):
            original_init(bot)
            # API keeps its own fixture response boundary on the same bot.
            api_get = bot.session.get
            def get(target, **kwargs):
                if target.startswith(source.Config.BASE_URL + '/'):
                    state.api_options.append(kwargs)
                    return api_get(target, **kwargs)
                return session.get(target, **kwargs)
            # Bot API fixture and real Requests transport remain independent.
            bot.session = type('BotSession', (), {'get': staticmethod(get), 'close': session.close})()

        def process(bot, post):
            try:
                if not bot.download(url, destination):
                    bot.total_errors += 1
                    return
            except adapter.integrity.InvalidMedia:
                bot.total_errors += 1
                return
            original_process(bot, post)

        def legacy(bot, target, path):
            state.legacy_urls.append(target)
            return False

        state.api_options, state.legacy_urls = [], []
        env = {'HTTP_PROXY': 'http://env.invalid:8000', 'HTTPS_PROXY': 'http://env.invalid:8000',
               'ALL_PROXY': 'http://env-all.invalid:8000', 'NO_PROXY': ''}
        with patch.object(adapter, 'load_source', return_value=source), \
             patch.object(source.MegaBot, '__init__', init), \
             patch.object(source.MegaBot, 'process_post', process), \
             patch.object(source.MegaBot, 'get_proxy', return_value=PROXY), \
             patch.object(source.MegaBot, 'download', legacy, create=True), \
             patch.object(adapter.integrity, 'probe', return_value=PROBE), \
             patch.object(adapter.integrity, 'make_poster', side_effect=lambda _, p: p.write_bytes(PNG)) as poster, \
             patch.object(adapter.integrity.VerifiedStorage, 'verify_publication'), \
             patch.dict(os.environ, env):
            try:
                state.result = adapter.run_profile(
                    'allowed', checkpoint=lambda *value: state.checkpoints.append(value),
                    download_dir=destination.parent, lock_dir=self.directory / 'locks')
                state.error = None
            except adapter.RetryableError as error:
                state.error = str(error)
            state.poster_count = poster.call_count
        state.transport, state.destination = transport, destination
        return state

    def test_cdn_direct_download_publishes_and_api_keeps_proxy(self):
        state = self.exercise([reply()])
        self.assertEqual(state.inserted, {'1'})
        self.assertEqual(state.destination.read_bytes(), PNG)
        self.assertEqual(state.legacy_urls, [])
        self.assertTrue(state.api_options)
        self.assertTrue(all(options['proxies'] == PROXY for options in state.api_options))
        self.assertEqual(len(state.transport.calls), 1)
        request, options = state.transport.calls[0]
        self.assertEqual(request.url, CDN)
        self.assertFalse(any(options['proxies'].values()), options['proxies'])
        self.assertEqual(options['timeout'], (5, 30))
        self.assertEqual(request.headers['User-Agent'], 'fixture-agent')
        self.assertEqual(request.headers['Referer'], 'https://fixture.invalid/')
        self.assertEqual(request.headers['Accept-Encoding'], 'identity')
        self.assertNotIn('Range', request.headers)

    def test_only_exact_https_cdn_can_bypass_proxy(self):
        for url in ['http://cdn.leakgallery.com/1.png', 'https://cdn.leakgallery.com.evil.invalid/1.png',
                    'https://user@cdn.leakgallery.com/1.png', 'https://cdn.leakgallery.com:444/1.png',
                    'https://cdn.leakgallery.com:bad/1.png', 'https://other.invalid/1.png']:
            with self.subTest(url=url):
                state = self.exercise([], url=url)
                self.assertEqual(state.transport.calls, [])
                self.assertEqual(state.legacy_urls, [url])
                self.assertFalse(state.inserted)

    def test_explicit_port443_is_direct(self):
        state = self.exercise([reply()], url='https://cdn.leakgallery.com:443/1.png')
        self.assertEqual(state.inserted, {'1'})
        self.assertEqual(len(state.transport.calls), 1)

    def test_invalid_direct_response_retries_original_url_through_proxy(self):
        bad = [reply(status=206), reply(status=302, Location='https://untrusted.invalid/private'),
               reply(status=401), reply(status=403), reply(status=404), reply(body=b''),
               reply(body=b'<html>challenge</html>'), reply(**{'Content-Range': 'bytes 0-21/100'}),
               reply(**{'Content-Length': '999'}), TimeoutError('private-url-must-not-leak')]
        for response in bad:
            with self.subTest(response=type(response).__name__ if isinstance(response, Exception) else response[0]):
                state = self.exercise([response, reply()])
                self.assertEqual(state.inserted, {'1'})
                self.assertEqual(state.destination.read_bytes(), PNG)
                self.assertEqual([call[0].url for call in state.transport.calls], [CDN, CDN])
                self.assertEqual(state.transport.calls[1][1]['proxies']['https'], PROXY['https'])
                self.assertEqual(requests.utils.select_proxy(CDN, state.transport.calls[1][1]['proxies']), PROXY['https'])
                self.assertEqual(state.transport.calls[1][1]['timeout'], 60)
                self.assertFalse(state.destination.with_suffix('.png.part').exists())
                self.assertTrue(all(response.raw.closed for response in state.transport.replies))

    def test_both_proxy_retries_reject_redirect_and_partial_without_publication(self):
        state = self.exercise([reply(status=302, Location='https://untrusted.invalid/a'),
                               reply(status=302, Location='https://untrusted.invalid/b'), reply(status=206)],
                              initial=b'old-file-must-not-be-reused')
        self.assertEqual([call[0].url for call in state.transport.calls], [CDN] * 3)
        self.assertEqual(state.destination.read_bytes(), b'old-file-must-not-be-reused')
        self.assertFalse(state.inserted)
        self.assertEqual(state.checkpoints, [])
        self.assertEqual(state.error, 'media_processing_failed')

    def test_interrupted_stream_never_promotes_partial_and_proxy_starts_fresh(self):
        def broken(*_, **__):
            yield PNG
            self.assertFalse((self.directory / 'downloads' / '1.png').exists())
            raise TimeoutError('signed-fixture-url')
        state = self.exercise([(200, broken, {}), reply()])
        self.assertEqual(state.inserted, {'1'})
        self.assertEqual(state.destination.read_bytes(), PNG)
        self.assertFalse(state.destination.with_suffix('.png.part').exists())

    def test_stream_limit_and_oversized_length_do_not_write_or_publish(self):
        class Oversized(bytes):
            def __len__(self):
                return 2 * 1024**3 + 1
        def oversized(*_, **__):
            yield Oversized(PNG)
        state = self.exercise([(200, oversized, {}), reply(**{'Content-Length': str(2 * 1024**3 + 1)}),
                               reply(status=403)], initial=b'previous')
        self.assertFalse(state.inserted)
        self.assertEqual(state.checkpoints, [])
        self.assertEqual(state.destination.read_bytes(), b'previous')
        self.assertFalse(state.destination.with_suffix('.png.part').exists())

    def test_successful_unknown_length_response_is_validated(self):
        state = self.exercise([(200, PNG, {})])
        self.assertEqual(state.inserted, {'1'})
        self.assertEqual(state.destination.read_bytes(), PNG)

    def test_video_still_generates_poster_after_valid_route(self):
        state = self.exercise([reply(body=VIDEO)], video=True)
        self.assertEqual(state.inserted, {'1'})
        self.assertEqual(state.poster_count, 1)
        self.assertEqual(state.destination.with_name('1_thumb.webp').read_bytes(), PNG)


if __name__ == '__main__':
    unittest.main()
