import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('buffer_pool', ROOT / 'ops/resize-mariadb-buffer-pool.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def state(size=module.OLD_SIZE, configured=False):
    return {'identity': {'id': 'a' * 64, 'image': 'sha256:unchanged', 'cmd': ['mariadbd'],
                         'mounts': [{'Name': 'photo_mariadb-data', 'Destination': '/var/lib/mysql'}]},
            'values': {'version': '11.4.12-MariaDB-ubu2404', 'innodb_buffer_pool_size': str(size),
                       'innodb_buffer_pool_size_max': str(8 * 1024 ** 4),
                       'innodb_buffer_pool_size_auto_min': str(8 * 1024 ** 4)},
            'config_hashes': {'/etc/mysql/mariadb.cnf': 'original', **({module.CONFIG: module.CONFIG_SHA} if configured else {})},
            'mem_available': 4 * 1024 ** 3}


class BufferPoolTests(unittest.TestCase):
    def test_plan_accepts_observed_online_growth_without_changing_ceiling_or_auto_min(self):
        original = state(); before = copy.deepcopy(original)
        module.guard(original, 'a' * 64)
        self.assertEqual(original, before)

    def test_guards_reject_stale_target_low_ceiling_low_memory_and_existing_config(self):
        for mutate in [lambda x: x['identity'].update(id='b' * 64),
                       lambda x: x['values'].update(innodb_buffer_pool_size='268435456'),
                       lambda x: x['values'].update(innodb_buffer_pool_size_max=str(module.OLD_SIZE)),
                       lambda x: x.update(mem_available=2 * 1024 ** 3),
                       lambda x: x['config_hashes'].update({module.CONFIG: 'someone_else'}),
                       lambda x: x['identity'].update(cmd=['mariadbd', '--innodb-buffer-pool-size=128M'])]:
            with self.subTest(mutate=mutate):
                snapshot = state(); mutate(snapshot)
                with self.assertRaises(RuntimeError): module.guard(snapshot, 'a' * 64)

    def test_apply_changes_only_size_and_our_new_config_and_keeps_private_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / 'backup.json'
            with mock.patch.object(module, 'observe', side_effect=[state(), state(module.TARGET, True)]), \
                 mock.patch.object(module, 'sql') as sql, \
                 mock.patch.object(module, 'docker', side_effect=[b'', b'--innodb_buffer_pool_size=1G\n']) as docker:
                result = module.apply('a' * 64, backup)
            self.assertEqual(result['stage'], 'verified')
            sql.assert_called_once_with('SET GLOBAL innodb_buffer_pool_size = 1073741824;')
            self.assertEqual(docker.call_args_list[0].kwargs['data'], module.CONTENT)
            self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(backup.read_text())['before'], state())

    def test_rollback_restores_size_and_removes_only_our_verified_config(self):
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / 'backup.json'
            module.save(backup, {'before': state(), 'target': module.TARGET, 'config_sha': module.CONFIG_SHA, 'stage': 'verified'})
            with mock.patch.object(module, 'observe', side_effect=[state(module.TARGET, True), state()]), \
                 mock.patch.object(module, 'sql') as sql, mock.patch.object(module, 'docker') as docker:
                result = module.rollback(backup)
            self.assertEqual(result['stage'], 'rolled_back')
            sql.assert_called_once_with('SET GLOBAL innodb_buffer_pool_size = 134217728;')
            docker.assert_called_once_with('exec', module.CONTAINER, 'rm', '--', module.CONFIG)

    def test_rollback_after_config_only_failure_does_not_send_unnecessary_set(self):
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / 'backup.json'
            module.save(backup, {'before': state(), 'target': module.TARGET, 'config_sha': module.CONFIG_SHA, 'stage': 'config_written'})
            with mock.patch.object(module, 'observe', side_effect=[state(configured=True), state()]), \
                 mock.patch.object(module, 'sql') as sql, mock.patch.object(module, 'docker'):
                module.rollback(backup)
            sql.assert_not_called()

    def test_rollback_refuses_changed_config_or_another_container_before_any_mutation(self):
        for field in ('config', 'container'):
            changed = state(module.TARGET, True)
            if field == 'config': changed['config_hashes'][module.CONFIG] = 'someone_else'
            else: changed['identity']['id'] = 'b' * 64
            with tempfile.TemporaryDirectory() as directory:
                backup = Path(directory) / 'backup.json'
                module.save(backup, {'before': state(), 'target': module.TARGET, 'config_sha': module.CONFIG_SHA, 'stage': 'verified'})
                with mock.patch.object(module, 'observe', return_value=changed), \
                     mock.patch.object(module, 'sql') as sql, mock.patch.object(module, 'docker') as docker:
                    with self.assertRaises(RuntimeError): module.rollback(backup)
                    sql.assert_not_called(); docker.assert_not_called()

    def test_all_known_partial_stages_recover_without_touching_unknown_state(self):
        for phase, size, configured in [('prepared', module.OLD_SIZE, False),
                                        ('prepared', module.OLD_SIZE, True),
                                        ('config_written', module.TARGET, True),
                                        ('size_set', module.TARGET, True)]:
            with self.subTest(phase=phase, size=size, configured=configured), tempfile.TemporaryDirectory() as directory:
                backup = Path(directory) / 'backup.json'
                module.save(backup, {'before': state(), 'target': module.TARGET, 'config_sha': module.CONFIG_SHA, 'stage': phase})
                with mock.patch.object(module, 'observe', side_effect=[state(size, configured), state()]), \
                     mock.patch.object(module, 'sql') as sql, mock.patch.object(module, 'docker') as docker:
                    self.assertEqual(module.rollback(backup)['stage'], 'rolled_back')
                    self.assertEqual(sql.call_count, int(size == module.TARGET))
                    self.assertEqual(docker.call_count, int(configured))

    def test_unknown_stage_fails_before_any_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / 'backup.json'
            module.save(backup, {'before': state(), 'target': module.TARGET, 'config_sha': module.CONFIG_SHA, 'stage': 'unrecognized'})
            with mock.patch.object(module, 'observe', return_value=state()), \
                 mock.patch.object(module, 'sql') as sql, mock.patch.object(module, 'docker') as docker:
                with self.assertRaisesRegex(RuntimeError, 'unknown_backup_stage'): module.rollback(backup)
                sql.assert_not_called(); docker.assert_not_called()

    def test_resize_poll_is_bounded_and_never_repeats_the_set(self):
        with mock.patch.object(module, 'observe', side_effect=[state(), state(module.TARGET)]), \
             mock.patch.object(module.time, 'sleep') as sleep:
            self.assertEqual(module.wait_size(module.TARGET)['values']['innodb_buffer_pool_size'], str(module.TARGET))
            sleep.assert_called_once_with(.5)
        with mock.patch.object(module, 'observe', return_value=state()) as observe, \
             mock.patch.object(module.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'resize_not_verified'): module.wait_size(module.TARGET)
            self.assertEqual(observe.call_count, 6)

    def test_source_config_and_future_compose_mount_match_the_single_setting(self):
        self.assertEqual((ROOT / 'infra/mariadb/tuning.cnf').read_bytes(), module.CONTENT)
        for name in ('docker-compose.yml', 'docker-compose.prod.yml', 'docker-compose.vps.yml'):
            self.assertEqual((ROOT / name).read_text().count('./infra/mariadb/tuning.cnf:/etc/mysql/conf.d/90-buffer-pool.cnf:ro'), 1)


if __name__ == '__main__': unittest.main()
