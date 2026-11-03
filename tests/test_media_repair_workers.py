"""Real child processes and durable checkpoints; no media or network I/O."""
from contextlib import closing
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import signal
import sqlite3
import tempfile
import time
import types
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('media_workers',ROOT/'ops/run-media-repair-workers.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class RepairError(RuntimeError):pass

class Clock:
    def __init__(self):self.now=1000.
    def __call__(self):return self.now
    def sleep(self,seconds):self.now+=seconds;time.sleep(.01)

class Runtime:
    def __init__(self,log,actions=None):self.log=Path(log);self.actions=actions or {}
    def write(self,event,photo_id):
        fd=os.open(self.log,os.O_WRONLY|os.O_APPEND|os.O_CREAT,0o600)
        try:os.write(fd,(json.dumps({'event':event,'id':photo_id,'pid':os.getpid(),'at':time.monotonic()})+'\n').encode())
        finally:os.close(fd)
    def run(self,row,apply=False):
        assert apply is True
        self.write('start',row['id']);time.sleep(.15 if row['id']=='a' else .22)
        action=self.actions.get(row['id'])
        if action=='crash':os._exit(7)
        if action:raise RepairError(action)
        self.write('finish',row['id']);return {'status':'restored'}
    def close(self):pass

class WaitingRuntime(Runtime):
    def run(self,row,apply=False):
        self.write('start',row['id']);time.sleep(30)
        return {'status':'restored'}

class TailRuntime(Runtime):
    """The long first job completes only after the old 100-claim boundary."""
    def run(self,row,apply=False):
        assert apply is True
        self.write('start',row['id'])
        marker=self.log.with_name('beyond-100-started')
        if row['id']=='a':
            deadline=time.monotonic()+8
            while not marker.exists():
                if time.monotonic()>=deadline:raise TimeoutError('test_dispatch_stalled')
                time.sleep(.01)
        else:
            if row['id']=='p100':marker.touch()
            time.sleep(.01)
        self.write('finish',row['id'])
        return {'status':'restored'}


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);self.clock=Clock()
        self.repair=types.SimpleNamespace(RepairError=RepairError)
        self.plan={'version':1,'rows':[{'id':x} for x in 'abcd']}
    def run_plan(self,actions=None,**kw):
        return b.run_pool(self.plan,'digest',self.root/'state',self.repair,'config',workers=kw.pop('workers',2),
                          max_items=4,delay=kw.pop('delay',2),clock=self.clock,sleep=self.clock.sleep,
                          runtime_factory=lambda *_:Runtime(self.root/'calls.jsonl',actions),**kw)
    def events(self):return [json.loads(x) for x in (self.root/'calls.jsonl').read_text().splitlines()]
    def test_larger_pool_keeps_filling_slots_past_100_while_a_long_job_is_active(self):
        plan={'version':1,'rows':[{'id':'a'}]+[{'id':f'p{i}'} for i in range(101)]}
        log=self.root/'tail-calls.jsonl'
        options=dict(workers=4,max_items=500,delay=2,clock=self.clock,sleep=self.clock.sleep,
                     runtime_factory=lambda *_:TailRuntime(log))
        result=b.run_pool(plan,'tail-digest',self.root/'tail-state',self.repair,'config',**options)
        self.assertEqual((result['phase'],result['attempted'],result['jobs']['done']),('session_complete',102,102))
        events=[json.loads(line) for line in log.read_text().splitlines()]
        after_boundary=next(event['at'] for event in events if event['event']=='start' and event['id']=='p100')
        long_finish=next(event['at'] for event in events if event['event']=='finish' and event['id']=='a')
        self.assertLess(after_boundary,long_finish)
        active=set();peak=0
        for event in events:
            if event['event']=='start':active.add(event['pid']);peak=max(peak,len(active))
            else:active.remove(event['pid'])
        self.assertLessEqual(peak,4);self.assertFalse(active)
        self.assertEqual(len([event for event in events if event['event']=='start']),102)
        self.clock.now+=2
        self.assertEqual(b.run_pool(plan,'tail-digest',self.root/'tail-state',self.repair,'config',**options)['attempted'],0)
        self.assertEqual(len(log.read_text().splitlines()),204)

    def test_pool_cap_rejects_invalid_limits_before_starting_any_children(self):
        for count in (0,501,True,1.5):
            with self.subTest(count=count):
                with self.assertRaisesRegex(b.shared.BackfillError,'run_limits_invalid'):
                    b.run_pool(self.plan,'digest',self.root/'state',self.repair,'config',
                               workers=4,max_items=count,delay=2,clock=self.clock,sleep=self.clock.sleep,
                               runtime_factory=lambda *_:Runtime(self.root/'calls.jsonl'))
        self.assertFalse((self.root/'calls.jsonl').exists())

    def test_priority_is_dispatched_first_without_skipping_the_rest(self):
        r=self.run_plan(priority_ids=['d'])
        starts=[e for e in self.events() if e['event']=='start']
        self.assertEqual(starts[0]['id'],'d')
        self.assertEqual(r['jobs']['done'],4)
        self.assertEqual(sorted(e['id'] for e in starts),list('abcd'))

    def test_parallel_children_restore_each_job_once_and_resume(self):
        original=json.loads(json.dumps(self.plan));r=self.run_plan()
        self.assertEqual(r['jobs']['done'],4);self.assertEqual(r['session'],{'restored':4});self.assertEqual(self.plan,original)
        events=self.events();starts=[e for e in events if e['event']=='start'];self.assertEqual(sorted(e['id'] for e in starts),list('abcd'))
        self.assertNotIn(os.getpid(),{e['pid'] for e in starts})
        a=next(e for e in events if e['event']=='finish' and e['id']=='a');bb=next(e for e in starts if e['id']=='b')
        self.assertLess(bb['at'],a['at'])
        self.clock.now+=2;self.assertEqual(self.run_plan()['attempted'],0)
    def test_network_failure_drains_inflight_and_success_cannot_clear_backoff(self):
        r=self.run_plan({'a':'source_http_503'})
        self.assertEqual((r['phase'],r['jobs']['retry'],r['jobs']['done'],r['jobs']['pending']),('paused_network',1,1,2))
        self.assertEqual(len([e for e in self.events() if e['event']=='start']),2)
        deadline=r['not_before'];self.clock.now=deadline-1;self.assertEqual(self.run_plan()['phase'],'paused')
    def test_content_validation_retries_are_delayed_without_stalling_either_pool(self):
        for reason in ('invalid_video','download_signature_rejected'):
            with self.subTest(reason=reason),tempfile.TemporaryDirectory() as folder:
                self.root=Path(folder);self.clock=Clock();pause=self.root/'shared'/'source-pause.json'
                result=self.run_plan({'a':reason},source_backoff=pause)
                self.assertEqual((result['phase'],result['jobs']['retry'],result['jobs']['done'],result['jobs']['skipped']),
                                 ('session_complete',1,3,0))
                self.assertEqual(sorted(e['id'] for e in self.events() if e['event']=='start'),list('abcd'))
                self.assertFalse(pause.exists())
                with closing(sqlite3.connect(self.root/'state/checkpoint.sqlite3')) as db:
                    state,available_at,raw=db.execute("SELECT state,available_at,result FROM jobs WHERE id='a'").fetchone()
                self.assertEqual((state,json.loads(raw)['reason']),('retry',reason))
                retry_event=next(json.loads(line) for line in (self.root/'state/events.jsonl').read_text().splitlines()
                                 if json.loads(line).get('reason')==reason)
                self.assertEqual(available_at,retry_event['at']+3600)
                self.clock.now+=2
                self.assertEqual(self.run_plan(source_backoff=pause)['attempted'],0)
                other=b.run_pool({'version':1,'rows':[{'id':'other'}]},'other-digest',self.root/'other-state',
                                 self.repair,'config',workers=1,max_items=1,delay=2,source_backoff=pause,
                                 clock=self.clock,sleep=self.clock.sleep,
                                 runtime_factory=lambda *_:Runtime(self.root/'other-calls'))
                self.assertEqual(other['jobs']['done'],1)
                self.clock.now=available_at-1
                self.assertEqual(self.run_plan(source_backoff=pause)['attempted'],0)
                self.clock.now=available_at
                resumed=self.run_plan(source_backoff=pause)
                self.assertEqual((resumed['attempted'],resumed['jobs']['done'],resumed['jobs']['retry']),(1,4,0))
    def test_network_and_unknown_errors_still_pause_both_pools(self):
        for reason in ('source_http_429','source_http_503','request_timeout','request_connection_error','runtime_timeout','runtime_failure','unknown_failure'):
            with self.subTest(reason=reason),tempfile.TemporaryDirectory() as folder:
                self.root=Path(folder);self.clock=Clock();pause=self.root/'shared'/'source-pause.json'
                result=self.run_plan({'a':reason},source_backoff=pause)
                self.assertEqual((result['phase'],result['jobs']['retry']),('paused_network',1))
                self.assertGreaterEqual(result['not_before'],1060)
                self.assertTrue(pause.exists())
                other=b.run_pool(self.plan,'other-digest',self.root/'other-state',self.repair,'config',
                                 workers=1,max_items=1,delay=2,source_backoff=pause,
                                 clock=self.clock,sleep=self.clock.sleep,
                                 runtime_factory=lambda *_:Runtime(self.root/'other-calls'))
                self.assertEqual((other['phase'],other['attempted']),('paused',0))
                self.assertFalse((self.root/'other-calls').exists())
    def test_local_retry_does_not_extend_or_clear_an_inflight_network_pause(self):
        pause=self.root/'shared'/'source-pause.json'
        result=self.run_plan({'a':'source_http_503','b':'invalid_video'},source_backoff=pause)
        self.assertEqual((result['phase'],result['jobs']['retry'],result['jobs']['pending']),('paused_network',2,2))
        self.assertEqual(result['not_before'],json.loads(pause.read_text())['not_before'])
        self.assertLessEqual(result['not_before'],self.clock()+60)
        with closing(sqlite3.connect(self.root/'state/checkpoint.sqlite3')) as db:
            deadlines=dict(db.execute("SELECT id,available_at FROM jobs WHERE state='retry'"))
        self.assertEqual(deadlines['a'],result['not_before'])
        self.assertGreaterEqual(deadlines['b'],4600)
    def test_notice_is_skipped_without_stopping_other_jobs(self):
        r=self.run_plan({'a':'notice_excluded'});self.assertEqual((r['jobs']['skipped'],r['jobs']['done']),(1,3))
    def test_dead_child_becomes_retry_and_prevents_next_dispatch(self):
        r=self.run_plan({'a':'crash'},workers=1)
        self.assertEqual((r['phase'],r['jobs']['retry'],r['jobs']['pending']),('paused_network',1,3))
    def test_shared_source_backoff_pauses_another_checkpoint(self):
        pause=self.root/'shared'/'source-pause.json';r=self.run_plan({'a':'source_http_503'},source_backoff=pause)
        other=b.run_pool(self.plan,'digest',self.root/'other',self.repair,'config',workers=1,max_items=1,delay=2,
                         source_backoff=pause,clock=self.clock,sleep=self.clock.sleep,
                         runtime_factory=lambda *_:Runtime(self.root/'other-calls'))
        self.assertEqual(other['phase'],'paused');self.assertEqual(other['attempted'],0);self.assertFalse((self.root/'other-calls').exists())
    def test_second_coordinator_is_refused(self):
        root=b.shared.private_directory(self.root/'state')
        with b.shared.file_lock(root/'driver.lock'):
            with self.assertRaisesRegex(b.shared.BackfillError,'already_running'):self.run_plan()
        self.assertFalse((self.root/'calls.jsonl').exists())
    def test_invalid_limits_fail_before_starting_children(self):
        for count in [0,5,True]:
            with self.assertRaises(b.shared.BackfillError):self.run_plan(workers=count)
        with self.assertRaises(b.shared.BackfillError):self.run_plan(delay=float('nan'))
    def test_original_running_job_recovers_only_under_exclusive_coordinator(self):
        root=b.shared.private_directory(self.root/'state')
        with b.shared.file_lock(root/'driver.lock'):
            state=b.shared.State(root,self.plan['rows'],'digest');state.next_job(self.clock());state.close()
        r=self.run_plan();self.assertEqual(r['jobs']['done'],4)
    def test_sigterm_stops_and_reaps_children_before_releasing_leader_lock(self):
        log=self.root/'signal-calls.jsonl'
        def coordinate():
            try:
                b.run_pool(self.plan,'digest',self.root/'signal-state',self.repair,'config',
                           workers=2,max_items=4,delay=2,
                           runtime_factory=lambda *_:WaitingRuntime(log))
            except KeyboardInterrupt:pass
        process=multiprocessing.get_context('fork').Process(target=coordinate);process.start()
        try:
            deadline=time.monotonic()+5
            while (not log.exists() or not log.read_text()) and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue(log.exists());children=[json.loads(x)['pid'] for x in log.read_text().splitlines()]
            self.assertTrue(children);os.kill(process.pid,signal.SIGTERM);process.join(5)
            self.assertFalse(process.is_alive());self.assertEqual(process.exitcode,0)
            for child in children:
                with self.assertRaises(ProcessLookupError):os.kill(child,0)
            with b.shared.file_lock(self.root/'signal-state'/'driver.lock'):pass
        finally:
            if process.is_alive():process.kill();process.join()
            process.close()

if __name__=='__main__':unittest.main()
