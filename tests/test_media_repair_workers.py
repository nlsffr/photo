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
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('media_workers',ROOT/'ops/run-media-repair-workers.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)

class RepairError(RuntimeError):pass

class Clock:
    def __init__(self):self.value=multiprocessing.Value('d',1000.)
    @property
    def now(self):return self.value.value
    @now.setter
    def now(self,value):self.value.value=value
    def __call__(self):return self.now
    def sleep(self,seconds):self.now+=seconds;time.sleep(.01)

class FastClock(Clock):
    def sleep(self,seconds):self.now+=max(seconds,1.);time.sleep(.001)

class Runtime:
    def __init__(self,log,actions=None):self.log=Path(log);self.actions=actions or {}
    def write(self,event,photo_id):
        fd=os.open(self.log,os.O_WRONLY|os.O_APPEND|os.O_CREAT,0o600)
        row={'event':event,'id':photo_id,'pid':os.getpid(),'at':time.monotonic()}
        if hasattr(self,'clock'):row['virtual']=self.clock()
        if hasattr(self,'instance'):row['instance']=self.instance
        try:os.write(fd,(json.dumps(row)+'\n').encode())
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

class CooldownRuntime(Runtime):
    """Keep one child in flight until a later dispatch releases it."""
    def __init__(self,log,clock,second_failure=False):
        super().__init__(log);self.clock=clock;self.second_failure=second_failure
    def run(self,row,apply=False):
        assert apply is True
        self.write('start',row['id'])
        release=self.log.with_name('release-slow-child')
        if row['id']=='a' or (row['id']=='c' and self.second_failure):
            if row['id']=='a':
                deadline=time.monotonic()+3
                while not any(json.loads(line)['event']=='start' and json.loads(line)['id']=='b'
                              for line in self.log.read_text().splitlines()):
                    if time.monotonic()>=deadline:raise TimeoutError('test_second_child_not_started')
                    time.sleep(.005)
            time.sleep(.03)
            raise RepairError('source_http_503')
        if row['id']=='b':
            deadline=time.monotonic()+3
            while not release.exists():
                if time.monotonic()>=deadline:raise TimeoutError('test_dispatch_stalled')
                time.sleep(.005)
        elif row['id']==('d' if self.second_failure else 'c'):
            release.touch()
        self.write('finish',row['id'])
        return {'status':'restored'}

class EightRuntime(Runtime):
    def run(self,row,apply=False):
        assert apply is True
        self.write('start',row['id'])
        deadline=time.monotonic()+3
        while sum(json.loads(line)['event']=='start' for line in self.log.read_text().splitlines())<8:
            if time.monotonic()>=deadline:raise TimeoutError('test_pool_not_filled')
            time.sleep(.005)
        self.write('finish',row['id'])
        return {'status':'restored'}

class ReuseRuntime(Runtime):
    def __init__(self,log,actions=None,fail_guard=False,fail_close=False):
        super().__init__(log,actions);self.instance=time.monotonic_ns();self.last=''
        self.fail_guard=fail_guard;self.fail_close=fail_close
        self.write('init','')
    def prepare_reuse(self):
        self.write('prepare',self.last)
        marker=self.log.with_name('guard-failed-once')
        if self.fail_guard and not marker.exists():
            marker.touch();raise RepairError('source_config_changed')
    def run(self,row,apply=False):
        assert apply is True
        self.last=row['id'];self.write('start',self.last);time.sleep(.03)
        action=self.actions.get(self.last)
        if action:raise RepairError(action)
        self.write('finish',self.last);return {'status':'restored'}
    def close(self):
        self.write('close',self.last)
        if self.fail_close and self.last=='a':raise RuntimeError('close_failed')

class NoReuseRuntime(ReuseRuntime):
    prepare_reuse=None

class MixedWaitingRuntime(ReuseRuntime):
    def run(self,row,apply=False):
        if row['id']=='a':return super().run(row,apply)
        assert apply is True
        self.last=row['id'];self.write('start',self.last);time.sleep(30)
        return {'status':'restored'}

def wrong_reply_child(connection,parent,inherited,state,*_):
    parent.close()
    for channel in inherited:channel.close()
    state.close();os.setsid()
    job=connection.recv()
    connection.send({'id':'wrong-claim','ok':True,'status':'restored'})
    try:time.sleep(30)
    except KeyboardInterrupt:pass


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
    def run_reused(self,*,runtime=ReuseRuntime,actions=None,fail_guard=False,fail_close=False,clock=None):
        return b.run_pool(self.plan,'digest',self.root/'state',self.repair,'config',workers=1,
                          max_items=4,delay=2,clock=clock or self.clock,sleep=(clock or self.clock).sleep,
                          runtime_factory=lambda *_:runtime(self.root/'calls.jsonl',actions,fail_guard,fail_close))
    def test_one_child_reuses_its_own_runtime_and_checks_the_guard_before_every_later_job(self):
        result=self.run_reused()
        self.assertEqual(result['jobs']['done'],4)
        events=self.events();starts=[e for e in events if e['event']=='start']
        self.assertEqual(len({e['pid'] for e in starts}),1)
        self.assertNotIn(os.getpid(),{e['pid'] for e in events})
        self.assertEqual(len({e['instance'] for e in starts}),1)
        self.assertEqual([e['event'] for e in events].count('init'),1)
        self.assertEqual([e['event'] for e in events].count('prepare'),3)
        self.assertEqual([e['event'] for e in events].count('close'),1)
        self.assertEqual([e['id'] for e in starts],list('abcd'))
    def test_a_runtime_without_a_reuse_guard_is_recreated_for_every_job(self):
        result=self.run_reused(runtime=NoReuseRuntime)
        self.assertEqual(result['jobs']['done'],4)
        events=self.events();starts=[e for e in events if e['event']=='start']
        self.assertEqual(len({e['pid'] for e in starts}),1)
        self.assertEqual(len({e['instance'] for e in starts}),4)
        self.assertEqual([e['event'] for e in events].count('close'),4)
        self.assertNotIn('prepare',[e['event'] for e in events])
    def test_parallel_reuse_keeps_each_runtime_inside_its_own_child(self):
        self.clock=FastClock()
        result=b.run_pool(self.plan,'digest',self.root/'state',self.repair,'config',workers=2,
                          max_items=4,delay=2,clock=self.clock,sleep=self.clock.sleep,
                          runtime_factory=lambda *_:ReuseRuntime(self.root/'calls.jsonl'))
        self.assertEqual(result['jobs']['done'],4)
        events=self.events();created=[e for e in events if e['event']=='init']
        self.assertEqual(len(created),2)
        self.assertEqual(len({e['instance'] for e in created}),2)
        for pid in {e['pid'] for e in created}:
            self.assertNotEqual(pid,os.getpid())
            self.assertEqual(len({e['instance'] for e in events if e['pid']==pid}),1)
        self.assertEqual([e['event'] for e in events].count('prepare'),2)
    def test_any_job_error_discards_the_runtime_before_the_next_job(self):
        result=self.run_reused(actions={'a':'invalid_video'})
        self.assertEqual((result['jobs']['done'],result['jobs']['retry']),(3,1))
        events=self.events();starts={e['id']:e for e in events if e['event']=='start'}
        self.assertEqual(starts['a']['pid'],starts['b']['pid'])
        self.assertNotEqual(starts['a']['instance'],starts['b']['instance'])
        self.assertEqual(starts['b']['instance'],starts['d']['instance'])
        self.assertLess(next(e['at'] for e in events if e['event']=='close' and e['id']=='a'),starts['b']['at'])
    def test_guard_failure_cannot_publish_the_claim_and_reopens_a_fresh_runtime(self):
        result=self.run_reused(fail_guard=True)
        self.assertEqual((result['phase'],result['attempted'],result['jobs']['done'],result['jobs']['retry']),
                         ('paused_network',2,1,1))
        self.assertEqual([e['id'] for e in self.events() if e['event']=='start'],['a'])
        self.clock.now=result['not_before']+2
        resumed=self.run_reused(fail_guard=True)
        self.assertEqual(resumed['jobs']['done'],4)
        self.assertEqual(sorted(e['id'] for e in self.events() if e['event']=='start'),list('abcd'))
    def test_failed_runtime_cleanup_retires_the_process_without_reusing_it(self):
        result=self.run_reused(actions={'a':'invalid_video'},fail_close=True)
        self.assertEqual((result['phase'],result['jobs']['done'],result['jobs']['retry']),('session_complete',3,1))
        starts={e['id']:e for e in self.events() if e['event']=='start'}
        self.assertNotEqual(starts['a']['pid'],starts['b']['pid'])
        with closing(sqlite3.connect(self.root/'state/checkpoint.sqlite3')) as db:
            available_at,raw=db.execute("SELECT available_at,result FROM jobs WHERE id='a'").fetchone()
        event=next(json.loads(line) for line in (self.root/'state/events.jsonl').read_text().splitlines()
                   if json.loads(line).get('reason')=='invalid_video')
        self.assertEqual(json.loads(raw)['reason'],'invalid_video')
        self.assertEqual(available_at,event['at']+3600)
    def test_partial_constructor_failure_reports_retry_and_retires_the_worker(self):
        def fail_factory(*_):
            ReuseRuntime(self.root/'calls.jsonl')
            raise RepairError('source_http_503')
        parent,child=multiprocessing.get_context('fork').Pipe()
        process=multiprocessing.get_context('fork').Process(target=b.repair_child,
            args=(child,parent,[],types.SimpleNamespace(close=lambda:None),self.repair,'config',
                  self.root/'repair.jsonl',self.root,fail_factory))
        process.start();child.close()
        try:
            parent.send({'id':'a'})
            self.assertTrue(parent.poll(3))
            outcome=parent.recv();process.join(3)
            self.assertEqual(outcome,{'id':'a','ok':False,'reason':'source_http_503','retire':True})
            self.assertFalse(process.is_alive())
            self.assertEqual(process.exitcode,0)
        finally:
            if process.is_alive():process.kill();process.join()
            parent.close();process.close()
    def test_idle_child_death_does_not_create_a_retry_or_duplicate_a_claim(self):
        sleep=self.clock.sleep;killed=[]
        def wait(seconds):
            path=self.root/'state/checkpoint.sqlite3'
            if not killed and path.exists():
                with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as db:
                    row=db.execute("SELECT state FROM jobs WHERE id='a'").fetchone()
                if row and row[0]=='done':
                    pid=next(e['pid'] for e in self.events() if e['event']=='start' and e['id']=='a')
                    try:os.kill(pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                    killed.append(pid);time.sleep(.03)
            sleep(seconds)
        result=b.run_pool(self.plan,'digest',self.root/'state',self.repair,'config',workers=1,
                          max_items=4,delay=2,clock=self.clock,sleep=wait,
                          runtime_factory=lambda *_:ReuseRuntime(self.root/'calls.jsonl'))
        self.assertTrue(killed)
        self.assertEqual((result['jobs']['done'],result['jobs']['retry']),(4,0))
        starts=[e for e in self.events() if e['event']=='start']
        self.assertEqual(len({e['pid'] for e in starts}),2)
        self.assertEqual(sorted(e['id'] for e in starts),list('abcd'))
    def test_a_reply_for_another_claim_is_rejected_before_checkpoint_completion(self):
        with patch.object(b,'repair_child',wrong_reply_child):
            result=self.run_reused()
        self.assertEqual((result['phase'],result['jobs']['done'],result['jobs']['retry']),('paused_network',0,1))
        with closing(sqlite3.connect(self.root/'state/checkpoint.sqlite3')) as db:
            raw=db.execute("SELECT result FROM jobs WHERE id='a'").fetchone()[0]
        self.assertEqual(json.loads(raw)['reason'],'worker_protocol_error')
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
    def cooldown_plan(self,*,second_failure=False,extend=False):
        self.clock=FastClock();pause=self.root/'shared'/'source-pause.json';extension={}
        sleep=self.clock.sleep
        def wait(seconds):
            sleep(seconds)
            if extend and not extension and pause.exists():
                first=json.loads(pause.read_text())['not_before']
                if self.clock()>=first-5:
                    extension['until']=b.SourceBackoff(pause).deadline(self.clock()+60)
        result=b.run_pool(self.plan,'digest',self.root/'state',self.repair,'config',workers=2,
                          max_items=4,delay=2,clock=self.clock,sleep=wait,source_backoff=pause,
                          runtime_factory=lambda *_:CooldownRuntime(self.root/'calls.jsonl',self.clock,second_failure))
        with closing(sqlite3.connect(self.root/'state/checkpoint.sqlite3')) as db:
            deadlines=dict(db.execute("SELECT id,available_at FROM jobs WHERE state='retry'"))
        return result,deadlines,extension
    def test_expired_network_pause_refills_a_slot_before_a_slow_child_finishes(self):
        result,deadlines,_=self.cooldown_plan()
        self.assertEqual((result['phase'],result['attempted'],result['jobs']['done'],result['jobs']['retry']),
                         ('session_complete',4,3,1))
        events=self.events();start=next(e for e in events if e['event']=='start' and e['id']=='c')
        finish=next(e for e in events if e['event']=='finish' and e['id']=='b')
        self.assertGreaterEqual(start['virtual'],deadlines['a'])
        self.assertLess(start['at'],finish['at'])
    def test_another_pool_can_extend_the_cooldown_before_dispatch_resumes(self):
        result,_,extension=self.cooldown_plan(extend=True)
        self.assertEqual((result['jobs']['done'],result['jobs']['retry']),(3,1))
        start=next(e for e in self.events() if e['event']=='start' and e['id']=='c')
        self.assertGreaterEqual(start['virtual'],extension['until'])
    def test_a_new_network_failure_after_resume_requires_another_full_cooldown(self):
        result,deadlines,_=self.cooldown_plan(second_failure=True)
        self.assertEqual((result['attempted'],result['jobs']['done'],result['jobs']['retry']),(4,2,2))
        events=self.events();starts={e['id']:e for e in events if e['event']=='start'}
        self.assertGreaterEqual(starts['c']['virtual'],deadlines['a'])
        self.assertGreaterEqual(starts['d']['virtual'],deadlines['c'])
        self.assertGreaterEqual(deadlines['c'],starts['c']['virtual']+60)
        self.assertLess(starts['d']['at'],next(e['at'] for e in events if e['event']=='finish' and e['id']=='b'))
    def test_eight_children_are_supported_without_exceeding_the_concurrency_cap(self):
        self.clock=FastClock();plan={'version':1,'rows':[{'id':f'item{i}'} for i in range(24)]}
        result=b.run_pool(plan,'eight-digest',self.root/'state',self.repair,'config',workers=8,
                          max_items=24,delay=2,clock=self.clock,sleep=self.clock.sleep,
                          runtime_factory=lambda *_:EightRuntime(self.root/'calls.jsonl'))
        self.assertEqual((result['attempted'],result['jobs']['done']),(24,24))
        active=set();peak=0
        for event in self.events():
            if event['event']=='start':active.add(event['pid']);peak=max(peak,len(active))
            else:active.remove(event['pid'])
        self.assertEqual(peak,8);self.assertFalse(active)
        self.assertEqual(len([event for event in self.events() if event['event']=='start']),24)
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
        for count in [0,9,12,True,1.5]:
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
    def test_sigterm_reaps_both_an_idle_worker_and_an_active_worker(self):
        log=self.root/'mixed-signal.jsonl';state_dir=self.root/'mixed-state';clock=FastClock()
        plan={'version':1,'rows':[{'id':x} for x in 'ab']}
        def coordinate():
            try:
                b.run_pool(plan,'mixed-digest',state_dir,self.repair,'config',workers=2,max_items=2,
                           delay=2,clock=clock,sleep=clock.sleep,
                           runtime_factory=lambda *_:MixedWaitingRuntime(log))
            except KeyboardInterrupt:pass
        process=multiprocessing.get_context('fork').Process(target=coordinate);process.start()
        children=set()
        try:
            deadline=time.monotonic()+5
            while time.monotonic()<deadline:
                events=[json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
                starts={e['id']:e for e in events if e['event']=='start'}
                if set(starts)==set('ab') and any(e['event']=='finish' and e['id']=='a' for e in events):
                    with closing(sqlite3.connect((state_dir/'checkpoint.sqlite3').as_uri()+'?mode=ro',uri=True)) as db:
                        if db.execute("SELECT state FROM jobs WHERE id='a'").fetchone()==('done',):break
                time.sleep(.005)
            self.assertEqual(set(starts),set('ab'))
            self.assertEqual({e['id'] for e in events if e['event']=='finish'},{'a'})
            children={e['pid'] for e in events}
            self.assertEqual(len(children),2)
            for pid in children:os.kill(pid,0)
            os.kill(process.pid,signal.SIGTERM);process.join(5)
            self.assertFalse(process.is_alive());self.assertEqual(process.exitcode,0)
            for pid in children:
                with self.assertRaises(ProcessLookupError):os.kill(pid,0)
            with b.shared.file_lock(state_dir/'driver.lock'):pass
        finally:
            if process.is_alive():process.kill();process.join()
            process.close()

if __name__=='__main__':unittest.main()
