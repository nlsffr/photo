"""Photo repair planning and shared-driver behavior; no production or media I/O."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('photo_backfill',ROOT/'ops/backfill-missing-photos.py')
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)


def uid(number):return '00000000-0000-0000-0000-'+str(number).zfill(12)

def row(number,handle='person',public_source=None,kind='photo'):
    source=str(number)
    return {'id':uid(number),'photo_source_id':public_source,'type':kind,'file_size':0,'url_version':23,
            'video_url':None,'image_url':'/media/creators/'+handle+'/'+source+'.jpg','preview_url':None,
            'is_hidden':0,'removed_from_index_at':None,'creator_id':'creator-'+handle,'handle':handle,
            'creator_hidden':0,'creator_removed':None}


def entry(number,handle='person',photo_id=None):
    return {'source_id':str(number),'photo_id':photo_id or uid(number),
            'minio_key':'creators/'+handle+'/'+str(number)+'.jpg'}


class Cursor:
    def __init__(self,db):self.db=db;self.result=[]
    def execute(self,sql,params=None):
        self.db.queries.append((sql,params or []))
        if 'FROM photos p' in sql:self.result=[copy.deepcopy(x) for x in self.db.photos if x['id'] in params]
        elif 'FROM bot_ingested' in sql:self.result=[copy.deepcopy(x) for x in self.db.registry if str(x['source_id']) in params]
        else:self.result=[]
    def fetchall(self):return self.result
    def close(self):pass


class Database:
    def __init__(self,photos,registry):self.photos=photos;self.registry=registry;self.queries=[];self.transactions=[]
    def cursor(self,dictionary=False):return Cursor(self)
    def start_transaction(self,**kwargs):self.transactions.append(kwargs)
    def rollback(self):pass


class Clock:
    def __init__(self):self.now=1000.;self.waits=[]
    def __call__(self):return self.now
    def sleep(self,seconds):self.waits.append(seconds);self.now+=seconds


class FakePublisher:
    def __init__(self,actions=None):self.actions=actions or {};self.calls=[];self.closed=False
    def run(self,expected,apply=False):
        self.calls.append(copy.deepcopy(expected))
        result=self.actions.get(expected['id'])
        if isinstance(result,Exception):raise result
        return {'id':expected['id'],'status':result or 'already_present'}
    def close(self):self.closed=True


class PhotoBackfillTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);self.clock=Clock()
        self.plan={'version':1,'kind':'photo-assets','rows':[{**row(1),'source_id':'1','minio_key':entry(1)['minio_key']}]}

    def inventory(self,*ids):return {'complete_for_local_photo_prefixes':True,'active_photos_snapshot':100,'missing_rows':[{'id':v} for v in ids]}

    def run_plan(self,runtime,**kwargs):
        return b.run_plan(self.plan,'immutable',self.root/'state','private-config',runtime_factory=lambda *_:runtime,
                          clock=self.clock,sleep=self.clock.sleep,**kwargs)

    def test_prepare_uses_both_primary_keys_preserves_null_and_prioritizes_requested_creator(self):
        db=Database([row(1),row(2,'hannahowo','2'),row(3),row(4)],
                    [entry(1),entry(2,'hannahowo'),entry(3,photo_id='unrelated')])
        plan=b.prepare_plan(self.inventory(uid(1),uid(2),uid(3),uid(4)),db,'inventory',now=100)
        self.assertEqual([r['id'] for r in plan['rows']],[uid(2),uid(1)])
        self.assertEqual(plan['summary']['priority_creator_rows'],1)
        self.assertIsNone(plan['rows'][1]['photo_source_id'])
        self.assertEqual(plan['rows'][1]['url_version'],23)
        self.assertEqual(plan['rows'][1]['image_url'],row(1)['image_url'])
        self.assertEqual(plan['summary']['review_reasons'],{'registry_unresolved':2})
        self.assertTrue(all(x['readonly'] for x in db.transactions))
        sql='\n'.join(q for q,_ in db.queries)
        self.assertIn('WHERE p.id IN (',sql);self.assertIn('WHERE source_id IN (',sql)
        self.assertNotIn('JOIN bot_ingested',sql)

    def test_partial_inventory_is_rejected_without_sql(self):
        db=Database([],[])
        with self.assertRaises(b.shared.BackfillError):b.prepare_plan({'complete_for_local_photo_prefixes':False},db,'x')
        self.assertEqual(db.queries,[])

    def test_video_review_adds_only_empty_video_url_cases(self):
        review={'version':1,'review':[{'id':uid(2),'reason':'video_url_empty'},
                                   {'id':uid(3),'reason':'invalid_poster_key'},
                                   {'id':uid(4),'reason':'notice_excluded'}]}
        db=Database([row(1),row(2,kind='video')],[entry(1),entry(2)])
        plan=b.prepare_plan(self.inventory(uid(1)),db,'x',video_review=review,video_digest='review')
        self.assertEqual([r['id'] for r in plan['rows']],[uid(1),uid(2)])
        self.assertEqual(plan['rows'][1]['type'],'video');self.assertEqual(plan['video_review_sha256'],'review')
        self.assertEqual(plan['summary']['requested_ids'],2)

    def test_planning_batches_at_one_hundred(self):
        numbers=range(1,206);db=Database([row(n,public_source=str(n)) for n in numbers],[entry(n) for n in numbers])
        plan=b.prepare_plan(self.inventory(*[uid(n) for n in numbers]),db,'x')
        self.assertEqual(len(plan['rows']),205)
        self.assertTrue(all(len(params)<=100 for _,params in db.queries))

    def test_bad_or_changed_registry_never_enters_plan(self):
        altered=row(1);altered['is_hidden']=1
        db=Database([altered,row(2)], [entry(1),{**entry(2),'minio_key':'creators/other/2.jpg'}])
        plan=b.prepare_plan(self.inventory(uid(1),uid(2)),db,'x')
        self.assertFalse(plan['rows'])
        self.assertEqual({r['reason'] for r in plan['review']},{'excluded','invalid_photo_key'})

    def test_shared_driver_reuses_existing_image_without_rewriting_plan(self):
        runtime=FakePublisher();before=copy.deepcopy(self.plan)
        result=self.run_plan(runtime)
        self.assertEqual(result['session'],{'already_present':1})
        self.assertEqual(self.plan,before);self.assertEqual(runtime.calls,self.plan['rows']);self.assertTrue(runtime.closed)
        self.clock.now+=2
        self.assertEqual(self.run_plan(FakePublisher())['attempted'],0)

    def test_withdrawal_and_source_video_are_reviewed_not_retried(self):
        for code in ['notice_excluded','source_not_matching_photo']:
            with self.subTest(code=code),tempfile.TemporaryDirectory() as folder:
                result=b.run_plan(self.plan,'hash',Path(folder)/'state','cfg',runtime_factory=lambda *_:FakePublisher({uid(1):b.photo.RepairError(code)}),clock=self.clock,sleep=self.clock.sleep)
                self.assertEqual(result['session'],{'skipped':1});self.assertEqual(result['jobs']['retry'],0)

    def test_network_backoff_survives_restart(self):
        runtime=FakePublisher({uid(1):b.photo.RepairError('source_http_503')})
        result=self.run_plan(runtime)
        self.assertEqual(result['phase'],'paused_network');self.assertEqual(result['jobs']['retry'],1)
        next_runtime=FakePublisher()
        self.assertEqual(self.run_plan(next_runtime)['phase'],'paused');self.assertFalse(next_runtime.calls)

    def test_photo_delay_and_session_limits_are_enforced(self):
        for kwargs in [{'delay':1},{'max_items':101}]:
            with self.assertRaises(b.shared.BackfillError):self.run_plan(FakePublisher(),**kwargs)

    def test_runtime_builds_private_audit_then_uses_photo_revalidation_and_maps_result(self):
        expected=self.plan['rows'][0];calls=[]
        source=types.SimpleNamespace(Config=types.SimpleNamespace(BASE_URL='https://api.leakgallery.com'),
                                     extract_handle=lambda d:d['owner'],cdn_url=lambda p:'https://cdn.leakgallery.com/'+p)
        details={'id':'1','owner':'person','is_video':False,'file_path':'content/full.jpg'}
        class Response:
            status_code=200
            def __enter__(self):return self
            def __exit__(self,*_):pass
            def json(self):return details
        fake=types.SimpleNamespace(source=source,candidate=lambda x:copy.deepcopy(expected),request=lambda *_:Response(),
                                   close=lambda:None)
        def publish(audited,apply):
            calls.append((copy.deepcopy(audited),apply))
            b.photo.validate_source(audited,expected,details,source)
            return {'id':expected['id'],'status':'photo_restored','public_urls_unchanged':True}
        fake.run=publish
        with patch.object(b.photo,'Repair',return_value=fake):
            runtime=b.Runtime('cfg','journal');result=runtime.run(expected,apply=True)
        self.assertEqual(result['status'],'restored');self.assertNotIn('source_api',expected)
        self.assertTrue(calls[0][1]);self.assertEqual(calls[0][0]['source_api']['1']['file_path'],'content/full.jpg')

    def test_source_boolean_video_is_not_published_as_photo(self):
        expected=self.plan['rows'][0];writes=[]
        source=types.SimpleNamespace(Config=types.SimpleNamespace(BASE_URL='https://api.leakgallery.com'),
                                     extract_handle=lambda d:d['owner'],cdn_url=lambda p:'https://cdn.leakgallery.com/'+p)
        class Response:
            status_code=200
            def __enter__(self):return self
            def __exit__(self,*_):pass
            def json(self):return {'id':'1','owner':'person','is_video':True,'file_path':'content/video.mp4'}
        fake=types.SimpleNamespace(source=source,candidate=lambda x:copy.deepcopy(expected),request=lambda *_:Response(),run=lambda *a,**k:writes.append(a))
        with patch.object(b.photo,'Repair',return_value=fake):
            with self.assertRaisesRegex(b.photo.RepairError,'source_not_matching_photo'):b.Runtime('cfg','journal').run(expected,True)
        self.assertFalse(writes)


if __name__=='__main__':unittest.main()
