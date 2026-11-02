#!/usr/bin/env python3
"""One guarded 128 MiB -> 1 GiB change. Dry-run by default; no Docker restart."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

CONTAINER = 'photo-mariadb-1'
TARGET = 1024 ** 3
OLD_SIZE = 128 * 1024 ** 2
CONFIG = '/etc/mysql/conf.d/90-buffer-pool.cnf'
CONTENT = b'[mysqld]\ninnodb_buffer_pool_size=1G\n'
CONFIG_SHA = hashlib.sha256(CONTENT).hexdigest()
VARIABLES = ('innodb_buffer_pool_size', 'innodb_buffer_pool_size_max', 'innodb_buffer_pool_size_auto_min')
AUTH = ('sh', '-eu', '-c', 'export MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"; '
        'test -n "$MYSQL_PWD"; exec mariadb --user=root --protocol=socket --connect-timeout=3 --batch --raw --skip-column-names')


def docker(*args, data=None):
    result = subprocess.run(['docker', *args], input=data, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError('docker_operation_failed')  # Never echo authentication output.
    return result.stdout


def sql(statement):
    return docker('exec', '-i', CONTAINER, *AUTH, data=statement.encode()).decode()


def observe():
    template = '{"id":{{json .Id}},"image":{{json .Image}},"cmd":{{json .Config.Cmd}},"mounts":{{json .Mounts}}}'
    identity = json.loads(docker('inspect', '--format', template, CONTAINER))
    text = sql("SELECT 'version',VERSION(); SHOW GLOBAL VARIABLES WHERE Variable_name IN (" + ','.join("'" + key + "'" for key in VARIABLES) + ');')
    values = dict(line.split('\t', 1) for line in text.strip().splitlines())
    files = docker('exec', CONTAINER, 'find', '/etc/mysql', '-type', 'f', '-name', '*.cnf', '-exec', 'sha256sum', '{}', '+').decode()
    hashes = {line.split(None, 1)[1]: line.split(None, 1)[0] for line in files.splitlines()}
    memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
    return {'identity': identity, 'values': values, 'config_hashes': hashes,
            'mem_available': int(memory['MemAvailable'].split()[0]) * 1024}


def guard(snapshot, expected_id):
    if snapshot['identity']['id'] != expected_id:
        raise RuntimeError('container_changed')
    values = snapshot['values']
    if not values['version'].startswith('11.4.'):
        raise RuntimeError('unreviewed_version')
    if int(values['innodb_buffer_pool_size']) != OLD_SIZE:
        raise RuntimeError('initial_size_changed')
    if int(values['innodb_buffer_pool_size_max']) < TARGET:
        raise RuntimeError('online_growth_not_allowed')
    if snapshot['mem_available'] - (TARGET - OLD_SIZE) < 2 * 1024 ** 3:
        raise RuntimeError('insufficient_memory_headroom')
    if CONFIG in snapshot['config_hashes']:
        raise RuntimeError('configuration_already_exists')
    if any('innodb-buffer-pool-size' in arg.replace('_', '-') for arg in snapshot['identity']['cmd']):
        raise RuntimeError('command_line_overrides_configuration')


def unchanged(before, after, expected_size, has_config):
    if before['identity'] != after['identity']:
        raise RuntimeError('container_identity_or_mounts_changed')
    expected_values = {**before['values'], 'innodb_buffer_pool_size': str(expected_size)}
    expected_hashes = {**before['config_hashes'], **({CONFIG: CONFIG_SHA} if has_config else {})}
    if after['values'] != expected_values or after['config_hashes'] != expected_hashes:
        raise RuntimeError('verification_failed')


def save(path, value):
    temporary = path.with_name('.' + path.name + '.next')
    temporary.write_text(json.dumps(value, indent=2)); temporary.chmod(0o600)
    os.replace(temporary, path)


def wait_size(expected):
    for attempt in range(6):
        current = observe()
        if int(current['values']['innodb_buffer_pool_size']) == expected:
            return current
        if attempt < 5:
            time.sleep(.5)
    raise RuntimeError('resize_not_verified')


def apply(expected_id, backup):
    before = observe(); guard(before, expected_id)
    backup.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if backup.exists():
        raise RuntimeError('backup_already_exists')
    record = {'before': before, 'target': TARGET, 'config_sha': CONFIG_SHA, 'stage': 'prepared'}
    save(backup, record)
    # Noclobber also rejects symlinks. The file survives a restart of this same
    # container; the Compose mount makes it survive a later recreation.
    docker('exec', '-i', CONTAINER, 'sh', '-eu', '-c',
           'umask 022; set -C; cat > ' + CONFIG, data=CONTENT)
    record['stage'] = 'config_written'; save(backup, record)
    sql('SET GLOBAL innodb_buffer_pool_size = 1073741824;')
    record['stage'] = 'size_set'; save(backup, record)
    after = wait_size(TARGET); unchanged(before, after, TARGET, True)
    defaults = docker('exec', CONTAINER, 'my_print_defaults', '--mysqld').decode().splitlines()
    if '--innodb_buffer_pool_size=1G' not in defaults and '--innodb-buffer-pool-size=1G' not in defaults:
        raise RuntimeError('configuration_not_loaded_by_defaults')
    record.update(stage='verified', after=after); save(backup, record)
    return {'stage': record['stage'], 'size': TARGET, 'backup': str(backup)}


def rollback(backup):
    record = json.loads(backup.read_text()); before = record['before']; current = observe()
    if record.get('config_sha') != CONFIG_SHA or record.get('target') != TARGET:
        raise RuntimeError('unexpected_backup')
    if record.get('stage') not in ('prepared', 'config_written', 'size_set', 'verified', 'rolled_back'):
        raise RuntimeError('unknown_backup_stage')
    size = int(current['values']['innodb_buffer_pool_size'])
    has_config = CONFIG in current['config_hashes']
    if size not in (OLD_SIZE, TARGET) or int(before['values']['innodb_buffer_pool_size']) != OLD_SIZE:
        raise RuntimeError('unexpected_rollback_size')
    unchanged(before, current, size, has_config)
    if size == TARGET:
        sql('SET GLOBAL innodb_buffer_pool_size = 134217728;')
    if has_config:
        docker('exec', CONTAINER, 'rm', '--', CONFIG)
    restored = wait_size(OLD_SIZE); unchanged(before, restored, OLD_SIZE, False)
    record.update(stage='rolled_back', restored=restored); save(backup, record)
    return {'stage': record['stage'], 'size': OLD_SIZE}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--apply', action='store_true')
    mode.add_argument('--rollback', type=Path)
    parser.add_argument('--expected-container-id')
    parser.add_argument('--backup', type=Path)
    args = parser.parse_args()
    if args.apply:
        if not args.expected_container_id or not args.backup or not args.backup.is_absolute():
            parser.error('--apply requires an exact --expected-container-id and absolute --backup')
        result = apply(args.expected_container_id, args.backup)
    elif args.rollback:
        result = rollback(args.rollback)
    else:
        state = observe()
        result = {'observed': state, 'proposed_size': TARGET, 'mutations_executed': False}
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        # Detailed Docker/client stderr can contain infrastructure information.
        raise SystemExit('buffer-pool: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__)) from None
