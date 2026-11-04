import json
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch

from ops.megabot_queue import ads_control
from ops.megabot_queue import maison_controller


def success(enabled=False, revision=3):
    return {'ok': True, 'config': {'enabled': enabled, 'revision': revision,
        'placements': {key: key == 'header' for key in ads_control.PLACEMENTS},
        'updatedAt': '2026-11-04T00:00:00.000Z'}, 'ready': True, 'missing': []}


class AdsControllerTests(unittest.TestCase):
    def test_fixed_exec_relays_read_and_cas_set_without_a_shell_or_client_actor(self):
        for command in ({'action': 'get'}, {'action': 'set', 'enabled': True, 'revision': 3}):
            expected = success(command.get('enabled', False), 4 if command['action'] == 'set' else 3)
            with patch.object(ads_control.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps(expected), '')) as run:
                self.assertEqual(ads_control.request(command), expected)
            self.assertEqual(run.call_args.args[0], ['docker', 'exec', '-i', 'photo-app-1', 'node', '/app/ops/ads-control.mjs'])
            self.assertEqual(json.loads(run.call_args.kwargs['input']), command)
            self.assertNotIn('shell', run.call_args.kwargs)

    def test_invalid_commands_do_not_start_a_process(self):
        for command in ({'action': 'toggle'}, {'action': 'get', 'sql': 'anything'},
            {'action': 'set', 'enabled': 1, 'revision': 0}, {'action': 'set', 'enabled': False, 'revision': True},
            {'action': 'set', 'enabled': True, 'revision': -1}, {'action': 'set', 'enabled': True, 'revision': 4294967295},
            {'action': 'set', 'enabled': False, 'revision': 3, 'actor': 'other'}):
            with patch.object(ads_control.subprocess, 'run') as run:
                with self.assertRaises(ads_control.AdsControlError) as error: ads_control.request(command)
            self.assertEqual(error.exception.status, 400); run.assert_not_called()

    def test_errors_malformed_oversized_and_timeouts_never_confirm_a_setting(self):
        for code, status in [('conflict', 409), ('not_ready', 400), ('unavailable', 503)]:
            with patch.object(ads_control.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, json.dumps({'ok': False, 'error': code}), '')):
                with self.assertRaises(ads_control.AdsControlError) as error: ads_control.request({'action': 'get'})
            self.assertEqual((error.exception.code, error.exception.status), (code, status))
        for body in ['not JSON', 'x' * 16385, json.dumps({**success(), 'ready': 'yes'}), json.dumps({**success(), 'config': {**success()['config'], 'revision': True}})]:
            with patch.object(ads_control.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, body, 'private error')):
                with self.assertRaises(ads_control.AdsControlError) as error: ads_control.request({'action': 'get'})
            self.assertEqual(str(error.exception), 'unavailable')
        with patch.object(ads_control.subprocess, 'run', side_effect=subprocess.TimeoutExpired([], 8)):
            with self.assertRaises(ads_control.AdsControlError) as error: ads_control.request({'action': 'get'})
        self.assertEqual(error.exception.status, 503)

    def test_real_unix_handler_preserves_bots_and_allows_only_bounded_ads_envelopes(self):
        with tempfile.TemporaryDirectory() as directory:
            address = str(Path(directory) / 'control.sock')
            server = maison_controller.Server(address, maison_controller.Handler)
            server.controller = Mock(); server.controller.status.return_value = {'ok': True, 'bots': []}
            server.controller.action.return_value = {'ok': True, 'bot': 'mega-1', 'action': 'stop'}
            thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            def send(value):
                raw = value if isinstance(value, bytes) else json.dumps(value).encode() + b'\n'
                with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
                    connection.settimeout(2); connection.connect(address); connection.sendall(raw)
                    with connection.makefile('rb') as stream: return json.loads(stream.readline(16385))
            try:
                with patch.object(ads_control.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, json.dumps(success()), '')) as run:
                    self.assertEqual(send({'op': 'ads', 'request': {'action': 'get'}}), success())
                    self.assertEqual(send({'op': 'ads', 'request': {'action': 'set', 'enabled': False, 'revision': 3}}), success())
                    self.assertEqual(run.call_count, 2)
                    self.assertEqual(send({'op': 'ads', 'request': {'action': 'get'}, 'extra': 1})['status'], 400)
                    self.assertEqual(send(b'{' + b' ' * 512 + b'}\n')['status'], 400)
                    self.assertEqual(run.call_count, 2)
                self.assertEqual(send({'op': 'status'}), {'ok': True, 'bots': []})
                self.assertEqual(send({'op': 'action', 'bot': 'mega-1', 'action': 'stop'})['action'], 'stop')
                server.controller.action.assert_called_once_with('mega-1', 'stop')
            finally: server.shutdown(); server.server_close(); thread.join(2)


if __name__ == '__main__': unittest.main()
