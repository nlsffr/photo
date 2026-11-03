import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('anonymous_pages',Path(__file__).resolve().parents[1]/'ops/anonymous-pages.py')
pages=importlib.util.module_from_spec(spec);spec.loader.exec_module(pages)


def record(stamp,kind='document',stream='stdout'):
    return json.dumps({'log':f'MAISON_PAGE_V1 {stamp:.3f} {kind}\n','stream':stream,'time':'unused'}).encode()+b'\n'

class PageCounterTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.root.chmod(0o700)
        self.cid='a'*64;self.folder=self.root/self.cid;self.folder.mkdir();self.log=self.folder/(self.cid+'-json.log')
        self.now=dt.datetime(2026,11,3,12,0,30,tzinfo=dt.timezone.utc).timestamp()
        self.log.write_bytes(record(self.now-10))
        self.counter=pages.Counter(self.root/'state',clock=lambda:self.now)
        self.addCleanup(lambda:self.counter.close())
    def source(self,path=None,cid=None):return {'id':cid or self.cid,'path':str(path or self.log),'driver':'json-file'}
    def poll(self,**kwargs):return self.counter.poll(self.source(),**kwargs)
    def append(self,data):
        with self.log.open('ab') as stream:stream.write(data)
    def count(self):
        return self.counter.db.execute('SELECT COALESCE(SUM(document+flight),0) FROM buckets').fetchone()[0]

    def test_first_activation_starts_at_eof_and_never_reads_old_history(self):
        self.assertEqual(self.poll()['state'],'available');self.assertEqual(self.count(),0)
        self.assertEqual(self.counter.last_read_bytes,0)
        self.append(record(self.now+1));self.now+=90
        self.poll();self.assertEqual(self.count(),1)
        report=self.counter.snapshot();self.assertEqual(report['periods']['today']['count'],1)
        self.assertEqual(report['periods']['today']['coverage'],'partial')
        self.assertIsNone(report['periods']['yesterday']['count'])

    def test_only_complete_stdout_json_markers_count_without_storing_identifiers(self):
        self.poll()
        self.append(b'{"log":"IP URL COOKIE PRIVATE","stream":"stdout"}\n')
        self.append(record(self.now+1,'flight')+record(self.now+2,'document','stderr'))
        self.append(json.dumps({'log':'prefix MAISON_PAGE_V1 1793700000.000 document\n','stream':'stdout'}).encode()+b'\n')
        self.now+=90;self.poll();self.assertEqual(self.count(),1)
        self.assertNotIn('PRIVATE',json.dumps(self.counter.snapshot()))
        text=' '.join(str(row) for row in self.counter.db.execute('SELECT * FROM buckets'))
        self.assertNotIn('COOKIE',text)

    def test_partial_lines_are_not_committed_and_restart_does_not_duplicate(self):
        self.poll();line=record(self.now+1);self.append(line[:20]);self.poll();self.assertEqual(self.count(),0)
        self.append(line[20:]);self.now+=2;self.poll();self.assertEqual(self.count(),1)
        self.counter.close();self.counter=pages.Counter(self.root/'state',clock=lambda:self.now)
        self.poll();self.assertEqual(self.count(),1)

    def test_cursor_and_counts_rollback_together_on_transaction_failure(self):
        self.poll();self.append(record(self.now+1));self.now+=2
        self.counter.db.execute("CREATE TRIGGER reject_bucket BEFORE INSERT ON buckets BEGIN SELECT RAISE(ABORT,'injected'); END")
        with self.assertRaises(Exception):self.poll()
        self.assertEqual(self.count(),0)
        self.counter.db.execute('DROP TRIGGER reject_bucket');self.poll();self.assertEqual(self.count(),1)

    def test_native_rotation_survives_restart_without_recounting(self):
        self.poll();self.append(record(self.now+1));self.now+=2;self.poll();self.assertEqual(self.count(),1)
        self.counter.close();self.log.rename(str(self.log)+'.1');self.log.write_bytes(record(self.now+1,'flight'))
        self.counter=pages.Counter(self.root/'state',clock=lambda:self.now+2)
        self.poll();self.assertEqual(self.count(),2)
        self.poll();self.assertEqual(self.count(),2)
        self.assertFalse(self.counter.db.execute('SELECT * FROM gaps').fetchall())

    def test_lost_rotation_and_truncation_mark_coverage_partial_without_recount(self):
        self.poll();self.append(record(self.now+1));self.now+=2;self.poll()
        self.log.unlink();self.log.write_bytes(record(self.now+1));self.now+=90;self.poll()
        self.assertTrue(self.counter.db.execute('SELECT * FROM gaps').fetchall())
        before=self.count();self.log.write_bytes(b'');self.now+=1;self.poll();self.assertEqual(self.count(),before)
        self.append(record(self.now+1));self.now+=90;self.poll()
        self.assertEqual(self.counter.snapshot()['periods']['today']['coverage'],'partial')

    def test_backlog_is_unknown_until_bounded_reads_catch_up(self):
        self.poll();self.append(b''.join(record(self.now+1) for _ in range(50)));self.now+=90
        first=self.poll(max_bytes=256)
        self.assertLessEqual(self.counter.last_read_bytes,256);self.assertEqual(first['state'],'stale')
        self.assertIsNone(first['periods']['today']['count'])
        for _ in range(100):
            report=self.poll(max_bytes=256)
            if report['state']=='available':break
        self.assertEqual(report['state'],'available');self.assertEqual(self.count(),50)
        self.now+=90;self.assertEqual(self.counter.snapshot()['state'],'stale')

    def test_container_recreation_drains_retained_old_file_and_does_not_replay_history(self):
        self.poll();self.append(record(self.now+1));self.now+=2
        other='b'*64;folder=self.root/other;folder.mkdir();path=folder/(other+'-json.log')
        path.write_bytes(record(self.now+1,'flight'))
        self.now+=2;self.counter.poll(self.source(path,other));self.assertEqual(self.count(),2)
        self.log.unlink();self.counter.poll(self.source(path,other));self.assertEqual(self.count(),2)
        # Without proof that the old writer stopped, its disappearance is a gap.
        self.assertTrue(self.counter.db.execute('SELECT * FROM gaps').fetchall())

    def test_compressed_lost_log_and_same_size_rewrite_are_explicit_gaps(self):
        self.poll();self.append(record(self.now+1));self.now+=2;self.poll()
        before=self.count();self.log.write_bytes(self.log.read_bytes());self.now+=2;self.poll()
        self.assertEqual(self.count(),before)
        self.assertTrue(self.counter.db.execute('SELECT * FROM gaps WHERE reason=?',('log_truncated',)).fetchall())
        Path(str(self.log)+'.1.gz').write_bytes(b'not-read-or-decompressed')
        self.now+=2;self.poll()
        self.assertTrue(self.counter.db.execute('SELECT * FROM gaps WHERE reason=?',('compressed_log_unreadable',)).fetchall())

    def test_healthy_empty_calendar_period_is_zero_but_old_period_is_unknown(self):
        self.now-=3*86400;self.poll();self.now+=3*86400;self.poll();report=self.counter.snapshot()
        for period in report['periods'].values():
            self.assertEqual(period['count'],0);self.assertEqual(period['coverage'],'complete')
        self.assertEqual(report['resolutionSeconds'],60)

    def test_malformed_or_future_marker_keeps_known_counts_but_exposes_gap(self):
        self.poll();self.append(b'not-docker-json\n'+record(self.now+1000));self.now+=2;self.poll()
        self.assertEqual(self.count(),0)
        self.assertEqual({row['reason'] for row in self.counter.db.execute('SELECT reason FROM gaps')},{'log_record_invalid','log_clock_skew'})

    def test_loss_after_backlog_marks_the_whole_unread_interval_partial(self):
        self.now-=2*86400;self.poll();self.now+=86400
        self.append(b''.join(record(self.now-10) for _ in range(50)))
        self.poll(max_bytes=128);self.now+=86400;self.poll(max_bytes=128)
        self.log.write_bytes(b'');self.now+=1;self.poll()
        self.assertEqual(self.counter.snapshot()['periods']['yesterday']['coverage'],'partial')

    def test_copytruncate_regrowth_beyond_saved_offset_is_not_replayed(self):
        self.poll();self.append(record(self.now+1));self.now+=2;self.poll();before=self.count()
        original=self.log.read_bytes();inode=self.log.stat().st_ino
        self.log.write_bytes(record(self.now+1,'flight')*8)
        self.assertGreater(self.log.stat().st_size,len(original))
        self.assertEqual(self.log.stat().st_ino,inode)
        self.now+=2;self.poll();self.assertEqual(self.count(),before)
        self.assertTrue(self.counter.db.execute('SELECT * FROM gaps WHERE reason=?',('log_truncated',)).fetchall())
        self.append(record(self.now+1));self.now+=2;self.poll();self.assertEqual(self.count(),before+1)

    def test_previous_container_can_finish_a_response_after_its_first_eof(self):
        self.now-=3*86400;self.poll();self.now+=3*86400
        other='b'*64;folder=self.root/other;folder.mkdir();path=folder/(other+'-json.log')
        path.write_bytes(record(self.now-1,'flight'))
        self.counter.poll(self.source(path,other));self.assertEqual(self.count(),1)
        self.append(record(self.now+1));self.now+=90
        report=self.counter.poll(self.source(path,other))
        self.assertEqual(self.count(),2)
        self.assertEqual(report['state'],'available')
        self.assertEqual(report['periods']['today']['coverage'],'complete')
        self.assertFalse(self.counter.db.execute('SELECT * FROM gaps').fetchall())

    def test_calendar_windows_follow_paris_dst_and_minute_resolution(self):
        start,end=pages.period_windows(dt.datetime(2026,3,30,12,tzinfo=dt.timezone.utc).timestamp())['yesterday']
        self.assertEqual(end-start,23*3600)
        start,end=pages.period_windows(dt.datetime(2026,10,26,12,tzinfo=dt.timezone.utc).timestamp())['yesterday']
        self.assertEqual(end-start,25*3600)
        self.assertEqual(pages.period_windows(self.now)['last24h'][1]%60,0)

    def test_singleton_lock_and_private_report(self):
        with self.assertRaises(pages.CounterError):pages.Counter(self.root/'state',clock=lambda:self.now)
        self.poll();path=self.root/'state/summary.json';pages.write_report(path,self.counter.snapshot())
        self.assertEqual(path.stat().st_mode&0o777,0o600)
        self.assertEqual(json.loads(path.read_text())['unit'],'page_responses')

if __name__=='__main__':unittest.main()
