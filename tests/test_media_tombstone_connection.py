import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('tombstone_connection', ROOT/'ops/refresh-removed-media-map.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class ConnectionTests(unittest.TestCase):
    def test_staging_blocks_now_and_does_not_survive_the_preserved_map(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root/'map.conf'
            args = ['--preserve-existing', '--output', str(output), '--lock-file', str(root/'guard.lock')]
            staging = ({'legal'}, {'/media/removed.jpg'}, {'stage'}, {'/media/staged.jpg'})
            with patch.dict(guard.os.environ, {'DATABASE_URL': 'mysql://name:secret@mariadb/database'}), \
                 patch.object(guard, '_database_tombstones', side_effect=[staging, (set(), set(), set(), set())]), \
                 patch.object(guard, '_run_nginx'):
                self.assertEqual(guard.main(args), 0)
                original = output.read_bytes()
                self.assertIn(b'$media_staged_creator', original)
                self.assertIn(b'$media_staged_object', original)
                self.assertIn(b'"stage" 1;', original)
                self.assertIn(b'"/media/staged.jpg" 1;', original)
                self.assertEqual(guard._existing_tombstones(original), staging[:2])
                self.assertEqual(guard.main(args), 0)
                self.assertEqual(output.read_bytes(), guard.render_map(*staging[:2]).encode())

    def test_database_classification_keeps_only_explicit_stage_rows_transient(self):
        rows = [('creator', 'removed', '/media/removed.webp', ''),
                ('photo', '', '/media/removal-photo.webp', ''),
                ('staging_creator', 'working', '', ''),
                ('staging_photo', '', '/media/working.webp', '/media/working.mp4')]
        self.assertEqual(guard._split_tombstones(rows, set()),
                         ({'removed'}, {'/media/removed.webp', '/media/removal-photo.webp'},
                          {'working'}, {'/media/working.webp', '/media/working.mp4'}))
        with self.assertRaisesRegex(RuntimeError, 'unexpected database response kind'):
            guard._split_tombstones([('unknown', '', '/media/unclassified.jpg', '')], set())

    def test_resolves_current_container_ip_without_inspecting_credentials(self):
        result = SimpleNamespace(returncode=0, stdout=json.dumps({'internal': {'IPAddress': '172.20.0.3'}}))
        with patch.object(guard.subprocess, 'run', return_value=result) as run:
            self.assertEqual(guard._container_database_host('/usr/bin/docker', 'photo-mariadb-1'), '172.20.0.3')
        self.assertEqual(run.call_args.args[0], ['/usr/bin/docker', 'inspect', '--format',
                                                '{{json .NetworkSettings.Networks}}', 'photo-mariadb-1'])

    def test_unavailable_ambiguous_or_invalid_networks_fail_without_exposing_output(self):
        for payload in ['not-json-secret', '{}', '[]',
                        json.dumps({'a': {'IPAddress': '172.20.0.3'}, 'b': {'IPAddress': '172.21.0.3'}}),
                        json.dumps({'a': {'IPAddress': ''}}),
                        json.dumps({'a': {'IPAddress': 'not-an-ip-secret'}})]:
            with self.subTest(payload=payload), patch.object(guard.subprocess, 'run',
                    return_value=SimpleNamespace(returncode=0, stdout=payload)):
                with self.assertRaises(RuntimeError) as error:
                    guard._container_database_host('docker', 'database')
                self.assertNotIn('secret', str(error.exception))
        with patch.object(guard.subprocess, 'run', side_effect=subprocess.TimeoutExpired('docker', 15)):
            with self.assertRaises(RuntimeError):
                guard._container_database_host('docker', 'database')

    def test_database_container_replaces_stale_loopback_only_for_tcp_host(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.dict(guard.os.environ, {'DATABASE_URL': 'mysql://name:secret@mariadb/database'}), \
                 patch.object(guard, '_container_database_host', return_value='172.20.0.7'), \
                 patch.object(guard, '_database_tombstones', return_value=(
                     {'removed'}, {'/media/removed.jpg'}, set(), set())) as query, \
                 patch.object(guard, '_run_nginx'):
                result = guard.main(['--database-container', 'photo-mariadb-1', '--output', str(root/'map.conf'),
                                     '--lock-file', str(root/'guard.lock')])
                self.assertEqual(result, 0)
                self.assertEqual(query.call_args.args[1], '172.20.0.7')
                self.assertEqual(query.call_args.args[0], 'mysql://name:secret@mariadb/database')

    def test_failed_resolution_or_database_read_never_replaces_existing_guard(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); output = root/'map.conf'; output.write_bytes(b'preserve-existing-map')
            for step in ('_container_database_host', '_database_tombstones'):
                with self.subTest(step=step), \
                     patch.dict(guard.os.environ, {'DATABASE_URL': 'mysql://name:secret@mariadb/database'}), \
                     patch.object(guard, '_container_database_host', return_value='172.20.0.3'), \
                     patch.object(guard, step, side_effect=RuntimeError('operation failed')), \
                     patch.object(guard, '_run_nginx') as nginx:
                    with self.assertRaises(RuntimeError):
                        guard.main(['--database-container', 'photo-mariadb-1', '--output', str(output),
                                    '--lock-file', str(root/'guard.lock')])
                    self.assertEqual(output.read_bytes(), b'preserve-existing-map')
                    nginx.assert_not_called()

    def test_existing_generated_entries_round_trip_without_losing_encoded_paths(self):
        handles = {'removed', 'another.profile'}
        paths = {'/media/removed.jpg', '/media/a%20b.webp', '/media/quote"image.jpg', '/media/back\\slash.jpg'}
        encoded = guard.render_map(handles, paths).encode()
        self.assertEqual(guard._existing_tombstones(encoded), (handles, paths))

    def test_preserve_existing_unions_sql_results_even_if_sql_is_empty(self):
        for added in [set(), {'/media/newly-removed.jpg'}]:
            with self.subTest(added=bool(added)), tempfile.TemporaryDirectory() as directory:
                root = Path(directory); output = root/'map.conf'
                output.write_text(guard.render_map({'removed-owner'}, {'/media/old-removal.jpg'}))
                with patch.dict(guard.os.environ, {'DATABASE_URL': 'mysql://name:secret@mariadb/database'}), \
                     patch.object(guard, '_database_tombstones', return_value=(set(), added, set(), set())), \
                     patch.object(guard, '_run_nginx'):
                    self.assertEqual(guard.main(['--preserve-existing', '--output', str(output),
                                                '--lock-file', str(root/'guard.lock')]), 0)
                self.assertEqual(guard._existing_tombstones(output.read_bytes()),
                                 ({'removed-owner'}, {'/media/old-removal.jpg'} | added))

    def test_unrecognized_existing_map_fails_before_query_or_reload(self):
        malformed = [b'not generated', guard.render_map(set(), set()).replace('default 0;', 'default 1;', 1).encode(),
                     guard.render_map(set(), set()).replace('  default 0;', '  ~regex 1;\n  default 0;', 1).encode()]
        for original in malformed:
            with self.subTest(original=original[:30]), tempfile.TemporaryDirectory() as directory:
                root = Path(directory); output = root/'map.conf'; output.write_bytes(original)
                with patch.object(guard, '_database_tombstones') as query, patch.object(guard, '_run_nginx') as nginx:
                    with self.assertRaisesRegex(RuntimeError, 'cannot be safely preserved'):
                        guard.main(['--preserve-existing', '--output', str(output), '--lock-file', str(root/'guard.lock')])
                    self.assertEqual(output.read_bytes(), original)
                    query.assert_not_called(); nginx.assert_not_called()


if __name__ == '__main__':
    unittest.main()
