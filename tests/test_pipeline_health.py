import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import Mock, patch

from ops.megabot_queue import health


class PipelineHealthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name); self.root.chmod(0o700)
        self.now = 1000
        self.roots = {kind: self.root / kind for kind in ('video', 'photo')}
        for kind, root in self.roots.items():
            root.mkdir(mode=0o700)
            db = sqlite3.connect(root / 'checkpoint.sqlite3')
            db.execute('CREATE TABLE jobs(id TEXT PRIMARY KEY,state TEXT,result TEXT)')
            rows = [('a','done',{'status':'restored'}), ('b','done',{'status':'restored'}),
                    ('c','done',{'status':'already_present'}), ('d','pending',None),
                    ('e','retry',{'status':'retry'}), ('f','skipped',{'status':'skipped'})]
            db.executemany('INSERT INTO jobs VALUES(?,?,?)', [(i,s,json.dumps(r) if r else None) for i,s,r in rows])
            db.commit(); db.close(); (root / 'checkpoint.sqlite3').chmod(0o600)
            self.write(root / 'progress.json', {'phase':'paused_network','not_before':1100})
            self.write_lines(root / 'events.jsonl', [{'at':900,'status':'restored','job':'hash'}, {'at':990,'status':'retry','reason':'runtime_failure'}])
            self.write_lines(root / 'repair.jsonl', [{'id':'a','status':'video_uploaded' if kind=='video' else 'photo_uploaded'}, {'id':'a','status':'poster_uploaded'}, {'id':'b','status':'poster_uploaded' if kind=='video' else 'photo_uploaded'}])
        self.config = self.root / 'config.json'
        self.write(self.config, {'env':{'MEGABOT_PROXIES':'socks5h://127.0.0.1:1080','S3_SECRET_KEY':'never-expose'}})
        self.proc = self.root / 'proc'; (self.proc / 'net').mkdir(parents=True)
        (self.proc / 'net/tcp').write_text('header\n 0: 0100007F:0438 00000000:0000 0A 0 0\n')
        self.queue = Mock()
        self.queue.health_snapshot.return_value = {'phase':'network_paused','updated_at':999,'pause_kind':'network','pause_until':1100,
            'slots':{i:{'pid':None,'owner':None} for i in range(1,5)}}
        self.queue.disabled_slots.return_value = {4}; self.queue._alive.return_value = False
        self.tool = health.PipelineHealth(queue_reader=lambda: self.queue, repair_roots=self.roots,
            queue_config=self.config, proc=self.proc, clock=lambda:self.now)

    def write(self, path, value):
        path.write_text(json.dumps(value)); path.chmod(0o600); os.utime(path,(self.now,self.now))
    def write_lines(self, path, rows):
        path.write_text(''.join(json.dumps(x)+'\n' for x in rows)); path.chmod(0o600)

    def test_counts_are_completed_rows_not_done_or_upload_events(self):
        with patch('socket.create_connection', side_effect=AssertionError('no upstream')):
            result = self.tool.snapshot()
        video = result['repairs']['video']; photo = result['repairs']['photo']
        self.assertEqual((video['restoredRows'],video['alreadyPresent'],video['videoFilesRestored'],video['posterOnlyRestored']), (2,1,1,1))
        self.assertEqual((video['pending'],video['retry'],video['excluded'],video['running']), (1,1,1,0))
        self.assertEqual(photo['restoredRows'],2)
        self.assertEqual(video['lastRestoredAt'],'1970-01-01T00:15:00Z')
        self.assertNotIn('never-expose',json.dumps(result)); self.assertNotIn('hash',json.dumps(result))
        self.assertEqual(result['queue']['enabledSlots'],3); self.assertEqual(result['queue']['activeWorkers'],0)
        self.assertTrue(result['queue']['proxyAvailable'])

    def test_missing_data_is_null_and_never_creates_a_database(self):
        for root in self.roots.values():
            (root/'checkpoint.sqlite3').unlink()
        result = self.tool.snapshot()
        for pool in result['repairs'].values():
            self.assertEqual(pool['state'],'unavailable'); self.assertIsNone(pool['restoredRows']); self.assertIsNone(pool['pending'])
        self.assertTrue(result['stale'])
        self.assertFalse(any((root/'checkpoint.sqlite3').exists() for root in self.roots.values()))

    def test_cached_snapshot_becomes_explicitly_stale_on_read_failure(self):
        before = self.tool.snapshot()['repairs']['video']; self.now += 11
        (self.roots['video']/'checkpoint.sqlite3').unlink()
        after = self.tool.snapshot()['repairs']['video']
        self.assertEqual(after['state'],'stale'); self.assertTrue(after['stale'])
        self.assertEqual(after['restoredRows'],before['restoredRows']); self.assertEqual(after['observedAt'],before['observedAt'])
        again = self.tool.snapshot()['repairs']['video']
        self.assertTrue(again['stale']); self.assertEqual(again['state'],'stale')

    def test_journal_append_is_incremental_and_does_not_count_unfinished_upload(self):
        self.tool.snapshot(); self.now += 11
        with (self.roots['video']/'repair.jsonl').open('a') as out:
            out.write(json.dumps({'id':'unfinished','status':'video_uploaded'})+'\n')
        with (self.roots['video']/'events.jsonl').open('a') as out:
            out.write(json.dumps({'at':1005,'status':'restored','job':'another-hash'})+'\n')
        result = self.tool.snapshot()['repairs']['video']
        self.assertEqual((result['videoFilesRestored'],result['posterOnlyRestored']),(1,1))
        self.assertEqual(result['lastRestoredAt'],'1970-01-01T00:16:45Z')

    def test_invalid_queue_and_absent_proxy_preserve_repair_results(self):
        self.queue.health_snapshot.side_effect = RuntimeError('private details')
        (self.proc/'net/tcp').write_text('header\n')
        result = self.tool.snapshot()
        self.assertIsNone(result['queue']['phase']); self.assertIsNone(result['queue']['activeWorkers'])
        self.assertFalse(result['queue']['proxyAvailable']); self.assertTrue(result['queue']['stale'])
        self.assertEqual(result['repairs']['video']['restoredRows'],2)
        self.assertNotIn('private details',json.dumps(result))

    def test_symlinked_checkpoint_and_large_journal_fail_closed(self):
        path = self.roots['video']/'checkpoint.sqlite3'; path.unlink(); path.symlink_to(self.roots['photo']/'checkpoint.sqlite3')
        with patch.object(health,'MAX_JOURNAL_BYTES',10): result = self.tool.snapshot()
        self.assertIsNone(result['repairs']['video']['restoredRows'])
        self.assertEqual(result['repairs']['photo']['restoredRows'],2)
        self.assertIsNone(result['repairs']['photo']['lastRestoredAt'])

    def test_extreme_timestamps_are_unknown_without_losing_other_counters(self):
        self.assertIsNone(health.iso(10**400))
        self.write(self.roots['video']/'progress.json',{'phase':'paused','not_before':10**400})
        self.write_lines(self.roots['video']/'events.jsonl',[{'at':10**400,'status':'restored'}])
        result = self.tool.snapshot()
        self.assertEqual(result['repairs']['video']['restoredRows'],2)
        self.assertIsNone(result['repairs']['video']['lastRestoredAt'])
        self.assertIsNone(result['repairs']['video']['pauseUntil'])
        self.assertEqual(result['repairs']['photo']['restoredRows'],2)

    def test_old_progress_does_not_announce_a_running_repair_process(self):
        path=self.roots['video']/'progress.json'
        self.write(path,{'phase':'running'}); os.utime(path,(1,1))
        row=self.tool.snapshot()['repairs']['video']
        self.assertEqual(row['state'],'available'); self.assertEqual(row['restoredRows'],2)
        self.assertIsNone(row['phase']); self.assertIn('repair_progress_stale',row['errors'])

    def test_malformed_upload_record_makes_detail_unknown_not_zero(self):
        self.write_lines(self.roots['video']/'repair.jsonl',[{'id':None,'status':'video_uploaded'}])
        row=self.tool.snapshot()['repairs']['video']
        self.assertEqual(row['restoredRows'],2)
        self.assertIsNone(row['videoFilesRestored']); self.assertIsNone(row['posterOnlyRestored'])
        self.assertIn('repair_details_unavailable',row['errors'])


if __name__ == '__main__': unittest.main()
