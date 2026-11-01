"""Real child processes and durable checkpoints; no media or network I/O."""
import importlib.util
import json
import multiprocessing
import os
from pathlib import Path
import signal
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
