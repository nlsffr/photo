"""Race regression: both repair counts and IDs must use one SQLite snapshot."""
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ops.megabot_queue import health


class RepairSnapshotWALTests(unittest.TestCase):
    # Used only by the independent RED experiment; no source file is mutated.
    SUPPRESS_BEGIN = False

    def test_counts_and_details_use_one_snapshot_when_writer_commits_between_reads(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            root.chmod(0o700)
            path = root / 'checkpoint.sqlite3'
            connect = sqlite3.connect
            db = connect(path)
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE jobs(id TEXT PRIMARY KEY,state TEXT,result TEXT)')
            db.executemany('INSERT INTO jobs VALUES(?,?,?)', [
                ('video', 'done', json.dumps({'status': 'restored'})),
                ('poster', 'done', json.dumps({'status': 'restored'})),
                ('in_flight', 'done', json.dumps({'status': 'already_present'})),
            ])
            db.commit()
            db.close()
            path.chmod(0o600)
            documents = {
                'progress.json': json.dumps({'phase': 'running'}),
                'events.jsonl': json.dumps({'at': 900, 'status': 'restored'}) + '\n',
                'repair.jsonl': ''.join(json.dumps(row) + '\n' for row in [
                    {'id': 'video', 'status': 'video_uploaded'},
                    {'id': 'poster', 'status': 'poster_uploaded'},
                    # An upload is not a restored row until checkpoint publication.
                    {'id': 'in_flight', 'status': 'video_uploaded'},
                ]),
            }
            for name, content in documents.items():
                target = root / name
                target.write_text(content)
                target.chmod(0o600)
            committed = []
            suppress_begin = self.SUPPRESS_BEGIN

            class ConcurrentWriterConnection:
                def __init__(self, reader):
                    self.reader = reader

                def __getattr__(self, name):
                    return getattr(self.reader, name)

                def execute(self, query, *args):
                    if suppress_begin and query.strip().upper() == 'BEGIN':
                        return None
                    if query.startswith('SELECT id FROM jobs') and not committed:
                        writer = connect(path, timeout=.2)
                        try:
                            writer.execute('UPDATE jobs SET result=? WHERE id=?',
                                           (json.dumps({'status': 'restored'}), 'in_flight'))
                            writer.commit()
                            committed.append(True)
                        finally:
                            writer.close()
                    return self.reader.execute(query, *args)

            def racing_connect(*args, **kwargs):
                return ConcurrentWriterConnection(connect(*args, **kwargs))

            with patch.object(health.sqlite3, 'connect', racing_connect):
                snapshot = health.RepairReader(root, 'video', lambda: 1000).snapshot()

            self.assertEqual(committed, [True], 'The writer must commit between the two SELECTs')
            self.assertEqual(snapshot['state'], 'available')
            self.assertEqual(snapshot['restoredRows'], 2)
            self.assertEqual(snapshot['alreadyPresent'], 1)
            self.assertEqual(snapshot['videoFilesRestored'], 1)
            self.assertEqual(snapshot['posterOnlyRestored'], 1)
            self.assertEqual(snapshot['videoFilesRestored'] + snapshot['posterOnlyRestored'],
                             snapshot['restoredRows'])
            # The writer really committed. The consistent reader is seeing its older snapshot.
            check = connect(path)
            try:
                count = check.execute("SELECT COUNT(*) FROM jobs WHERE json_extract(result,'$.status')='restored'").fetchone()[0]
                self.assertEqual(count, 3)
            finally:
                check.close()


if __name__ == '__main__':
    unittest.main()
