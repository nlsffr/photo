import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('video_backfill', ROOT/'ops/backfill-missing-video-assets.py')
backfill = importlib.util.module_from_spec(spec); spec.loader.exec_module(backfill)
repair = backfill.load_repair()


def row(photo_id='a', source=None, video='/media/creators/owner/123.mp4'):
    return {'id':photo_id,'photo_source_id':source,'file_size':10,'url_version':23,
            'video_url':video,'image_url':'/media/creators/owner/123_thumb.webp','preview_url':None,
            'is_hidden':0,'removed_from_index_at':None,'creator_id':'creator','handle':'owner',
            'creator_hidden':0,'creator_removed':None}


class Cursor:
    def __init__(self, db): self.db=db; self.results=[]
    def execute(self, sql, params=()):
        self.db.queries.append((sql, list(params)))
        if 'FROM photos p' in sql:
            self.results=[dict(x) for x in self.db.photos if x['id'] in params]
        elif 'FROM bot_ingested' in sql:
            self.results=[dict(x) for x in self.db.registry if x['source_id'] in params]
        else: self.results=[]
    def fetchall(self):return self.results
    def close(self):pass


class Database:
    def __init__(self, photos, registry):
        self.photos=photos;self.registry=registry;self.queries=[];self.transactions=[]
    def cursor(self, dictionary=False):return Cursor(self)
    def start_transaction(self, **kw):self.transactions.append(kw)
    def rollback(self):pass


class Clock:
    def __init__(self):self.now=1000.;self.waits=[]
    def __call__(self):return self.now
    def sleep(self, seconds):self.waits.append(seconds);self.now+=seconds


class Runtime:
    def __init__(self, actions=None, existing=None):
        self.actions=actions or {};self.existing=set(existing or []);self.calls=[];self.uploads=[];self.closed=False
    def run(self, expected, apply=False):
        assert apply is True
        self.calls.append(json.loads(json.dumps(expected)))
        action=self.actions.get(expected['id'])
        if isinstance(action, Exception):raise action
        if expected['id'] in self.existing:return {'id':expected['id'],'status':'already_present'}
        self.existing.add(expected['id']);self.uploads.append(expected['id'])
        return {'id':expected['id'],'status':'restored'}
    def close(self):self.closed=True


class SafeReasonTests(unittest.TestCase):
    @staticmethod
    def external_error(name, module, base=Exception):
        return type(name, (base,), {"__module__": module})

    def test_request_subclasses_are_classified_without_exception_text(self):
        request = self.external_error("RequestException", "requests.exceptions")
        timeout = self.external_error("Timeout", "requests.exceptions", request)
        connection = self.external_error("ConnectionError", "requests.exceptions", request)
        cases = [
            (self.external_error("ReadTimeout", "requests.exceptions", timeout), "request_timeout"),
            (self.external_error("ConnectTimeout", "requests.exceptions", timeout), "request_timeout"),
            (self.external_error("ProxyError", "requests.exceptions", connection), "request_connection_error"),
            (self.external_error("HTTPError", "requests.exceptions", request), "request_error"),
        ]
        for cls, expected in cases:
            with self.subTest(cls=cls.__name__):
                error = cls("https://user:PRIVATE_PASSWORD@private.invalid/media?token=PRIVATE_TOKEN")
                self.assertEqual(backfill.safe_reason(error, repair), expected)
        # An arbitrary application's class name is not a requests type.
        self.assertEqual(backfill.safe_reason(type("Timeout", (Exception,), {})("PRIVATE_TOKEN"), repair), "runtime_failure")

    def test_json_decode_has_priority_over_request_exception_and_redacts_document(self):
        error = json.JSONDecodeError("PRIVATE_TOKEN", "https://PRIVATE_PASSWORD@private.invalid", 0)
        self.assertEqual(backfill.safe_reason(error, repair), "json_decode_error")
        request = self.external_error("RequestException", "requests.exceptions")
        error_type = self.external_error("JSONDecodeError", "requests.exceptions", request)
        self.assertEqual(backfill.safe_reason(error_type("PRIVATE_TOKEN"), repair), "json_decode_error")

    def test_mysql_errno_is_numeric_bounded_and_only_for_connector_errors(self):
        base = self.external_error("Error", "mysql.connector.errors")
        subclass = self.external_error("OperationalError", "mysql.connector.errors", base)
        for errno, expected in [(1045, "database_mysql_1045"), (1205, "database_mysql_1205"),
                                (None, "database_mysql_error"), (True, "database_mysql_error"),
                                ("1045 PRIVATE_PASSWORD", "database_mysql_error"), (0, "database_mysql_error"),
                                (-1, "database_mysql_error"), (65536, "database_mysql_error")]:
            error = subclass("PRIVATE_PASSWORD at private.invalid")
            error.errno = errno
            self.assertEqual(backfill.safe_reason(error, repair), expected)
        foreign = RuntimeError("PRIVATE_PASSWORD")
        foreign.errno = 1045
        self.assertEqual(backfill.safe_reason(foreign, repair), "runtime_failure")

    def test_builtin_timeout_and_known_repair_policy_codes_remain_sanitized(self):
        self.assertEqual(backfill.safe_reason(TimeoutError("PRIVATE_PASSWORD"), repair), "runtime_timeout")
        for reason in backfill.SKIP_CODES | {"invalid_video", "source_http_503"}:
            self.assertEqual(backfill.safe_reason(repair.RepairError(reason), repair), reason)
        for reason in ["https://PRIVATE_PASSWORD@private.invalid", "PRIVATE PASSWORD", "x" * 81]:
            self.assertEqual(backfill.safe_reason(repair.RepairError(reason), repair), "runtime_failure")
        self.assertEqual(backfill.safe_reason(RuntimeError("PRIVATE_PASSWORD"), repair), "runtime_failure")


class RetryFairnessTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'state'
        self.rows=[{'id':value} for value in ['r0','r1']+[f'p{i}' for i in range(60)]]
        self.state=backfill.State(self.root,self.rows,'digest')
        self.addCleanup(lambda:self.state.close())
        self.state.db.execute("UPDATE jobs SET state='retry' WHERE id IN ('r0','r1')")

    def done(self, now=1000):
        job=self.state.next_job(now)
        self.assertIsNotNone(job)
        self.state.finish(job['id'],'done',{'status':'restored'},0,0)
        return job['id']

    def debt(self):
        return self.state.get_meta('retry_dispatch_debt','0')

    def test_retry_slot_survives_multiple_sessions_and_overrides_cache_pending_priority(self):
        self.state.prioritize([f'p{i}' for i in range(60)])
        self.assertEqual([self.done() for _ in range(10)],[f'p{i}' for i in range(10)])
        self.state.close()
        self.state=backfill.State(self.root,self.rows,'digest')
        self.state.prioritize([f'p{i}' for i in range(60)])
        self.assertEqual([self.done() for _ in range(15)],[f'p{i}' for i in range(10,25)])
        self.assertEqual(self.debt(),'25')
        self.assertEqual(self.done(),'r0')
        self.assertEqual(self.debt(),'0')

    def test_poison_retry_rotates_behind_older_eligible_retry_at_next_reserved_slot(self):
        self.state.prioritize([f'p{i}' for i in range(60)])
        for _ in range(25):self.done()
        job=self.state.next_job(1000)
        self.assertEqual(job['id'],'r0')
        self.state.finish('r0','retry',{'status':'retry','reason':'invalid_video'},1060,1060)
        for _ in range(25):self.done(2000)
        self.assertEqual(self.done(2000),'r1')

    def test_normal_priority_retry_does_not_reset_or_avoid_the_reserved_slot(self):
        self.state.prioritize(['r0'])
        job=self.state.next_job(1000)
        self.assertEqual(job['id'],'r0')
        self.assertEqual(self.debt(),'1')
        self.state.finish('r0','retry',{'status':'retry'},1060,1060)
        for _ in range(24):self.done()
        self.assertEqual(self.debt(),'25')
        self.assertEqual(self.done(),'r1')

    def test_future_retry_never_claimed_early_and_debt_stays_due_until_eligible(self):
        self.state.set_meta('retry_dispatch_debt',25)
        self.state.db.execute("UPDATE jobs SET available_at=1001 WHERE state='retry'")
        self.assertEqual(self.done(1000),'p0')
        self.assertEqual(self.debt(),'25')
        self.assertEqual(self.done(1001),'r0')
        self.assertEqual(self.debt(),'0')

    def test_retries_alone_advance_immediately_and_unavailable_or_terminal_jobs_never_claim(self):
        self.state.db.execute("UPDATE jobs SET state='done' WHERE id LIKE 'p%'")
        self.assertEqual(self.done(),'r0')
        self.state.db.execute("UPDATE jobs SET state='running' WHERE id='r1'")
        self.state.set_meta('retry_dispatch_debt',12)
        self.assertIsNone(self.state.next_job(1000))
        self.assertEqual(self.debt(),'12')
        self.state.db.execute("UPDATE jobs SET state='skipped' WHERE id='r1'")
        self.assertIsNone(self.state.next_job(1000))
        self.state.db.execute("UPDATE jobs SET state='pending',available_at=1001 WHERE id='p0'")
        self.assertIsNone(self.state.next_job(1000))
        self.assertEqual(self.done(1001),'p0')

    def test_invalid_durable_debt_fails_closed_without_claiming_or_resetting(self):
        for value in ('NaN','-1','26','1.0','',' 1','01'):
            with self.subTest(value=value):
                self.state.set_meta('retry_dispatch_debt',value)
                with self.assertRaisesRegex(backfill.BackfillError,'retry_dispatch_debt_invalid'):
                    self.state.next_job(1000)
                self.assertEqual(self.debt(),value)
                self.assertEqual(self.state.db.execute("SELECT COUNT(*) FROM jobs WHERE state='running'").fetchone()[0],0)
                self.assertFalse(self.state.db.in_transaction)

    def test_claim_and_counter_roll_back_together_when_counter_write_fails(self):
        self.state.set_meta('retry_dispatch_debt',12)
        self.state.db.execute("""CREATE TRIGGER reject_debt BEFORE INSERT ON meta
            WHEN NEW.key='retry_dispatch_debt' BEGIN SELECT RAISE(ABORT,'injected_meta_failure'); END""")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'injected_meta_failure'):
            self.state.next_job(1000)
        state,attempts=self.state.db.execute("SELECT state,attempts FROM jobs WHERE id='p0'").fetchone()
        self.assertEqual((state,attempts,self.debt()),('pending',0,'12'))
        self.assertFalse(self.state.db.in_transaction)


class BackfillTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.clock=Clock()
        self.plan={'version':1,'rows':[row('a'),row('b')]}
    def run_plan(self, runtime, **kw):
        return backfill.run_plan(self.plan,'digest',self.root/'state',repair,'config',
            clock=self.clock,sleep=self.clock.sleep,runtime_factory=lambda *args:runtime,**kw)

    def test_priorities_choose_only_eligible_jobs_without_resetting_results(self):
        root=backfill.private_directory(self.root/'priority-state')
        state=backfill.State(root,[row('a'),row('b'),row('c')],'digest')
        try:
            state.prioritize(['c','b'])
            state.finish('b','skipped',{'status':'skipped','reason':'notice_excluded'},0,0)
            self.assertEqual(state.next_job(1000)['id'],'c')
            state.finish('c','done',{'status':'restored'},0,0)
            self.assertEqual(state.next_job(1000)['id'],'a')
            self.assertEqual((state.summary()['done'],state.summary()['skipped']),(1,1))
        finally:state.close()

    def test_plan_uses_primary_keys_and_checks_exact_registry_identity(self):
        db=Database([row('a'),row('b','456'),row('c',video=None)],
                    [{'source_id':'123','photo_id':'a','minio_key':'creators/owner/123.mp4'},
                     {'source_id':'456','photo_id':'unrelated','minio_key':'creators/owner/123.mp4'}])
        inventory={'complete':True,'active_videos':4,'missing_rows':[{'id':x} for x in ['a','b','c','d']], 'thumbnail_missing_rows':[{'id':'a'}]}
        plan=backfill.prepare_plan(inventory,db,repair,'inventoryhash',now=100)
        self.assertEqual(len(plan['rows']),1)
        expected=plan['rows'][0]
        self.assertIsNone(expected['photo_source_id'])
        self.assertEqual((expected['source_id'],expected['url_version']),('123',23))
        self.assertEqual(expected['video_url'],row()['video_url'])
        self.assertEqual({x['reason'] for x in plan['review']},{'registry_unresolved','video_url_empty','inactive_or_missing'})
        self.assertTrue(all(x.get('readonly') is True for x in db.transactions))
        queries=[q for q,p in db.queries if q.startswith('SELECT')]
        self.assertTrue(any('p.id IN (' in q for q in queries))
        self.assertTrue(any('WHERE source_id IN (' in q for q in queries))
        self.assertFalse(any('JOIN bot_ingested' in q for q in queries))

    def test_prepare_rejects_partial_inventory_without_sql(self):
        db=Database([],[])
        with self.assertRaises(backfill.BackfillError):backfill.prepare_plan({'complete':False},db,repair,'x')
        self.assertFalse(db.queries)

    def test_prepare_batches_photos_and_registry_at_100(self):
        photos=[row(str(i),str(i),'/media/creators/owner/'+str(i)+'.mp4') for i in range(205)]
        db=Database(photos,[{'source_id':str(i),'photo_id':str(i),'minio_key':'creators/owner/'+str(i)+'.mp4'} for i in range(205)])
        inventory={'complete':True,'active_videos':205,'missing_rows':[{'id':x['id']} for x in photos], 'thumbnail_missing_rows':[]}
        plan=backfill.prepare_plan(inventory,db,repair,'x')
        self.assertEqual(plan['summary']['planned_rows'],205)
        self.assertTrue(all(len(params)<=100 for sql,params in db.queries))

    def test_run_resumes_and_never_rewrites_urls_or_versions(self):
        runtime=Runtime(existing=['a']);original=json.loads(json.dumps(self.plan))
        result=self.run_plan(runtime,max_items=2)
        self.assertEqual(result['session'],{'already_present':1,'restored':1})
        self.assertEqual(runtime.uploads,['b'])
        self.assertEqual(self.plan,original)
        self.assertEqual(runtime.calls,original['rows'])
        self.assertEqual(self.clock.waits,[1.0])
        self.clock.now+=1
        second=Runtime();result=self.run_plan(second,max_items=2)
        self.assertEqual(result['attempted'],0);self.assertFalse(second.calls)

    def test_crash_after_upload_recovers_as_already_present(self):
        root=backfill.private_directory(self.root/'state')
        with backfill.file_lock(root/'driver.lock'):
            state=backfill.State(root,self.plan['rows'],'digest');state.next_job(self.clock());state.close()
        runtime=Runtime(existing=['a'])
        result=self.run_plan(runtime)
        self.assertEqual(result['session'],{'already_present':1});self.assertFalse(runtime.uploads)
        self.assertEqual(result['jobs']['done'],1)

    def test_progress_shows_claimed_job_before_download_finishes(self):
        runtime = Runtime()
        original = runtime.run
        observed = []
        def process(expected, apply=False):
            progress = json.loads((self.root/'state/progress.json').read_text())
            observed.append((progress['phase'], progress['jobs']['running']))
            return original(expected, apply=apply)
        runtime.run = process
        self.run_plan(runtime)
        self.assertEqual(observed, [('running', 1)])

    def test_excluded_notice_is_recorded_skipped_without_bypass(self):
        runtime=Runtime(actions={'a':repair.RepairError('notice_excluded')})
        result=self.run_plan(runtime,max_items=2)
        self.assertEqual(result['session'],{'skipped':1,'restored':1})
        self.assertEqual(runtime.uploads,['b']);self.assertEqual(result['jobs']['skipped'],1)
        progress=json.loads((self.root/'state/progress.json').read_text())
        self.assertNotIn('/media/',json.dumps(progress))

    def test_network_backoff_persists_across_sessions(self):
        runtime=Runtime(actions={'a':TimeoutError('SENSITIVE_PRIVATE_CONNECTION')})
        result=self.run_plan(runtime,max_items=100)
        self.assertEqual(result['phase'],'paused_network');self.assertEqual(len(runtime.calls),1)
        self.assertEqual(result['not_before'],1060)
        self.clock.now=1001
        other=Runtime();result=self.run_plan(other,max_items=2)
        self.assertEqual(result['attempted'],0);self.assertFalse(other.calls)
        self.assertNotIn('SENSITIVE',json.dumps(result))
        events=(self.root/'state/events.jsonl').read_text()
        self.assertEqual(json.loads(events.splitlines()[0])['reason'],'runtime_timeout')
        self.assertNotIn('SENSITIVE',events)
        db=sqlite3.connect(self.root/'state/checkpoint.sqlite3')
        try:
            state,available_at,raw=db.execute("SELECT state,available_at,result FROM jobs WHERE id='a'").fetchone()
        finally:db.close()
        self.assertEqual((state,available_at,json.loads(raw)['reason']),('retry',1060,'runtime_timeout'))
        self.clock.now=1060
        result=self.run_plan(other,max_items=2)
        self.assertEqual(result['jobs']['done'],2)

    def test_source_http_503_is_retry_but_source_404_is_skip(self):
        runtime=Runtime(actions={'a':repair.RepairError('source_http_503')})
        result=self.run_plan(runtime,max_items=2)
        self.assertEqual((result['phase'],result['jobs']['retry']),('paused_network',1))
        self.assertEqual(len(runtime.calls),1)
        self.clock.now=1060
        runtime=Runtime(actions={'a':repair.RepairError('source_http_404')})
        result=self.run_plan(runtime,max_items=2)
        self.assertEqual((result['jobs']['done'],result['jobs']['skipped']),(1,1))
        events=(self.root/'state/events.jsonl').read_text()
        self.assertNotIn('/media/',events)
        self.assertNotIn('owner',events)

    def test_minimum_delay_is_preserved_between_separate_runs(self):
        result=self.run_plan(Runtime());self.assertEqual(result['attempted'],1)
        other=Runtime();result=self.run_plan(other)
        self.assertEqual(result['phase'],'paused');self.assertFalse(other.calls)

    def test_singleton_lock_prevents_second_publisher(self):
        root=backfill.private_directory(self.root/'state')
        with backfill.file_lock(root/'driver.lock'):
            with self.assertRaisesRegex(backfill.BackfillError,'already_running'):
                self.run_plan(Runtime())

    def test_changed_plan_does_not_reuse_checkpoint(self):
        self.run_plan(Runtime());self.clock.now+=1
        with self.assertRaisesRegex(backfill.BackfillError,'plan_changed'):
            backfill.run_plan(self.plan,'different',self.root/'state',repair,'config')

    def test_apply_limit_is_bounded_and_delay_cannot_be_disabled(self):
        for kw in [{'max_items':101},{'max_items':0},{'delay':0},{'delay':float('nan')}]:
            with self.assertRaises(backfill.BackfillError):self.run_plan(Runtime(),**kw)


if __name__=='__main__':unittest.main()
