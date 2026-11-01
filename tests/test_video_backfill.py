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


class BackfillTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.clock=Clock()
        self.plan={'version':1,'rows':[row('a'),row('b')]}
    def run_plan(self, runtime, **kw):
        return backfill.run_plan(self.plan,'digest',self.root/'state',repair,'config',
            clock=self.clock,sleep=self.clock.sleep,runtime_factory=lambda *args:runtime,**kw)

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
