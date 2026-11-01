from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import Mock, patch

from ops.megabot_queue import dashboard
from ops.megabot_queue import maison_controller as controller


class DashboardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / 'state'
        self.state.mkdir(mode=0o700)
        self.proc = self.root / 'proc'
        self.proc.mkdir()
        self.tool = dashboard.Dashboard(state_dir=self.state, proc=self.proc, clock=lambda: 100)
        self.raw = {'phase': 'running', 'updated_at': 100, 'supervisor_pid': 90,
                    'slots': [{'slot': i, 'pid': None, 'owner': None, 'handle': None, 'state': 'waiting'} for i in range(1, 5)]}
        self.write('status.json', self.raw)
        self.process(90, 'run')

    def write(self, name, data):
        path = self.state / name
        path.write_text(json.dumps(data))
        path.chmod(0o600)

    def process(self, pid, mode, owner=None):
        root = self.proc / str(pid)
        root.mkdir()
        (root / 'stat').write_text(f'{pid} (python) S ' + '0 ' * 18 + '987 0')
        args = ['python', '/opt/megabot-queue/current/ops/megabot_queue/supervisor.py', mode,
                '--config', str(dashboard.CONFIG)]
        if owner:
            args += ['--owner', owner]
        (root / 'cmdline').write_bytes(b'\0'.join(arg.encode() for arg in args) + b'\0')
        return root

    def test_control_flags_are_atomic_private_and_do_not_lose_parallel_updates(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda n: self.tool.set_enabled(f'mega-{n}', False), range(1, 5)))
        self.assertEqual(self.tool.disabled_slots(), {1, 2, 3, 4})
        self.assertEqual((self.state / 'control.json').stat().st_mode & 0o777, 0o600)
        self.tool.set_enabled('mega-2', True)
        self.assertEqual(self.tool.disabled_slots(), {1, 3, 4})
        self.assertFalse(list(self.state.glob('.control-*')))

    def test_absent_stale_and_dead_supervisor_never_write_control(self):
        for mutate in [lambda value: value.update(updated_at=50),
                       lambda value: value.update(supervisor_pid=777),
                       lambda value: value.update(phase='source_changed')]:
            raw = json.loads(json.dumps(self.raw))
            mutate(raw)
            self.write('status.json', raw)
            with self.assertRaises(dashboard.DashboardUnavailable):
                self.tool.set_enabled('mega-1', True)
            self.assertFalse((self.state / 'control.json').exists())
        (self.state / 'status.json').unlink()
        with self.assertRaises(dashboard.DashboardUnavailable):
            self.tool.set_enabled('mega-1', True)

    def test_invalid_disabled_slots_are_not_reset_or_reenabled(self):
        self.write('control.json', {'disabled_slots': [True]})
        with self.assertRaises(dashboard.DashboardUnavailable):
            self.tool.set_enabled('mega-1', True)
        self.assertEqual(json.loads((self.state / 'control.json').read_text()), {'disabled_slots': [True]})

    def test_waiting_legacy_preserves_existing_pid_and_counts(self):
        self.raw['phase'] = 'waiting_legacy'
        self.write('status.json', self.raw)
        old = {'id': 'mega-1', 'name': 'Mégabot 1', 'state': 'running', 'pid': 123,
               'actions': ['stop'], 'recent': {'success': 7, 'errors': 0, 'skipped': 1}}
        item = self.tool.item('mega-1', 'Mégabot 1', lambda: old)
        self.assertEqual(item['pid'], 123)
        self.assertEqual(item['recent']['success'], 7)
        self.assertEqual(item['actions'], ['stop'])
        self.assertTrue(item['managedQueue'])

    def test_managed_pid_is_verified_and_disabled_slot_waits_for_exit(self):
        child = self.process(91, '_worker', 'owner-1')
        self.raw['slots'][0] = {'slot': 1, 'pid': 91, 'owner': 'owner-1', 'handle': 'profile', 'state': 'running'}
        self.raw['env'] = {'do_not_expose': 'private-value'}
        self.write('status.json', self.raw)
        item = self.tool.item('mega-1', 'Mégabot 1', lambda: self.fail('legacy fallback'))
        self.assertEqual((item['state'], item['pid'], item['actions']), ('running', 91, ['stop']))
        self.assertNotIn('private-value', json.dumps(item))
        self.tool.set_enabled('mega-1', False)
        item = self.tool.item('mega-1', 'Mégabot 1', lambda: None)
        self.assertEqual((item['state'], item['actions']), ('running', []))
        shutil.rmtree(child)
        item = self.tool.item('mega-1', 'Mégabot 1', lambda: None)
        self.assertEqual((item['state'], item['pid'], item['actions']), ('stopped', None, ['start']))

    def test_world_readable_status_is_unavailable(self):
        (self.state / 'status.json').chmod(0o644)
        with self.assertRaises(dashboard.DashboardUnavailable):
            self.tool.snapshot()

    def test_reused_supervisor_pid_or_unowned_running_slot_is_unavailable(self):
        (self.proc / '90' / 'cmdline').write_bytes(b'python\0another_script.py\0')
        with self.assertRaises(dashboard.DashboardUnavailable):
            self.tool.snapshot()
        shutil.rmtree(self.proc / '90')
        self.process(90, 'run')
        self.raw['slots'][0].update(state='running', pid=91, owner=None)
        self.write('status.json', self.raw)
        with self.assertRaises(dashboard.DashboardUnavailable):
            self.tool.snapshot()


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.proc = self.root / 'proc'
        self.proc.mkdir()
        self.source = self.root / 'megabot.py'
        self.source.write_text('# fixture')
        self.log = self.root / 'bot1.log'
        self.log.write_text('')
        self.entry = {'id': 'mega-1', 'name': 'Mégabot 1', 'uid': 0, 'gid': 0, 'umask': 0o022,
                      'exe': '/usr/bin/python3.12', 'argv': ['python3', '-u', 'megabot.py'],
                      'cwd': str(self.root), 'script': str(self.source), 'log': str(self.log),
                      'sha256': hashlib.sha256(self.source.read_bytes()).hexdigest(),
                      'env': {'BOT_ID': '1', 'START_INDEX': '2000', 'END_INDEX': '2500', 'PRIVATE': 'secret-fixture'}}
        self.controller = controller.Controller({'bots': [self.entry]}, proc=self.proc, audit=self.root / 'audit.jsonl')

    def process(self, pid=123):
        root = self.proc / str(pid)
        root.mkdir()
        (root / 'exe').symlink_to(self.entry['exe'])
        (root / 'cwd').symlink_to(self.entry['cwd'])
        (root / 'cmdline').write_bytes(b'\0'.join(arg.encode() for arg in self.entry['argv']) + b'\0')
        (root / 'environ').write_bytes(b'\0'.join((k + '=' + v).encode() for k, v in self.entry['env'].items()) + b'\0')
        (root / 'status').write_text('Uid: 0 0 0 0\nGid: 0 0 0 0\nUmask: 0022\n')
        (root / 'stat').write_text(f'{pid} (python) S ' + '0 ' * 18 + '987 0')
        return root

    def managed(self):
        tool = Mock()
        tool.item.return_value = {'id': 'mega-1', 'state': 'active', 'actions': ['stop'], 'managedQueue': True}
        return tool

    def test_absent_queue_keeps_legacy_start_behavior(self):
        with patch.object(controller, 'managed_queue', return_value=None), patch.object(controller.subprocess, 'Popen') as launch:
            launch.return_value.pid = 123
            launch.return_value.poll.return_value = None
            launch.side_effect = lambda *a, **kw: (self.process(), launch.return_value)[1]
            self.assertEqual(self.controller.action('mega-1', 'start')['result'], 'started')
            self.assertEqual(launch.call_args.kwargs['env'], self.entry['env'])

    def test_managed_start_enables_slot_but_never_spawns_legacy(self):
        tool = self.managed()
        with patch.object(controller, 'managed_queue', return_value=tool), patch.object(controller.subprocess, 'Popen') as launch:
            reply = self.controller.action('mega-1', 'start')
        tool.set_enabled.assert_called_once_with('mega-1', True)
        launch.assert_not_called()
        self.assertEqual(reply['result'], 'enabled')
        self.assertNotIn('secret-fixture', (self.root / 'audit.jsonl').read_text())

    def test_missing_helper_and_stale_status_never_fall_back_to_legacy(self):
        for unavailable in ('loader', 'status'):
            tool = self.managed()
            tool.set_enabled.side_effect = dashboard.DashboardUnavailable()
            setup = {'side_effect': controller.ControlError('managed_queue_unavailable', 409)} if unavailable == 'loader' else {'return_value': tool}
            with patch.object(controller, 'managed_queue', **setup), patch.object(controller.subprocess, 'Popen') as launch:
                with self.assertRaises(controller.ControlError) as error:
                    self.controller.action('mega-1', 'start')
                self.assertEqual((error.exception.code, error.exception.status), ('managed_queue_unavailable', 409))
                launch.assert_not_called()
                if unavailable == 'loader':
                    self.assertEqual(self.controller.item(self.entry)['actions'], [])

    def test_installed_marker_with_missing_release_fails_closed(self):
        config = self.root / 'config.json'
        config.write_text('{}')
        with patch.object(controller, 'QUEUE_CONFIG', config), patch.object(controller, 'QUEUE_CURRENT', self.root / 'missing'):
            with self.assertRaisesRegex(controller.ControlError, 'managed_queue_unavailable'):
                controller.managed_queue(self.proc)

    def test_managed_stop_persists_flag_before_safe_legacy_stop(self):
        process = self.process()
        tool = self.managed()
        called = []
        tool.set_enabled.side_effect = lambda *args: called.append('disabled')
        def send(*args):
            self.assertEqual(called, ['disabled'])
            called.append('signal')
            shutil.rmtree(process)
        with patch.object(controller, 'managed_queue', return_value=tool), \
             patch.object(controller.os, 'pidfd_open', return_value=444, create=True) as opened, \
             patch.object(controller.signal, 'pidfd_send_signal', side_effect=send, create=True) as signaled, \
             patch.object(controller.os, 'close'):
            reply = self.controller.action('mega-1', 'stop')
        tool.set_enabled.assert_called_once_with('mega-1', False)
        opened.assert_called_once_with(123)
        signaled.assert_called_once_with(444, controller.signal.SIGTERM)
        self.assertEqual(reply['result'], 'stopped')

    def test_managed_stop_without_legacy_never_signals_worker_directly(self):
        tool = self.managed()
        with patch.object(controller, 'managed_queue', return_value=tool), \
             patch.object(controller.os, 'pidfd_open', create=True) as opened:
            reply = self.controller.action('mega-1', 'stop')
        tool.set_enabled.assert_called_once_with('mega-1', False)
        opened.assert_not_called()
        self.assertEqual(reply['result'], 'stop_requested')


if __name__ == '__main__':
    unittest.main()
