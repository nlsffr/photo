"""Photo classification repair, isolated from production and real media."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('photo_repair',Path(__file__).resolve().parents[1]/'ops/repair-misclassified-photo.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

class StorageError(Exception):
    def __init__(self,status):self.response={'ResponseMetadata':{'HTTPStatusCode':status}}

class Store:
    def __init__(self):self.objects={};self.puts=[]
    def head_object(self,Bucket,Key):
        if Key not in self.objects:raise StorageError(404)
        body,mime=self.objects[Key];return {'ContentLength':len(body),'ContentType':mime}
    def put_object(self,**values):
        self.puts.append({k:v for k,v in values.items() if k!='Body'})
        assert values['IfNoneMatch']=='*'
        if values['Key'] in self.objects:raise StorageError(412)
        self.objects[values['Key']]=(values['Body'].read(),values['ContentType'])

class Response:
    status_code=200
    headers={'Content-Type':'image/jpeg'}
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def iter_content(self,size):yield b'\xff\xd8\xffneutral-photo-fixture'

class PhotoRepairTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.row={'id':'00000000-0000-0000-0000-000000000001','creator_id':'creator','handle':'person','source_id':12,
          'photo_source_id':'12','type':'video','video_url':None,'image_url':'/media/creators/person/12.jpg',
          'preview_url':None,'minio_key':'creators/person/12.jpg','file_size':123,'url_version':1,
          'is_hidden':0,'creator_hidden':0,'removed_from_index_at':None,'creator_removed':None,
          'source_api':{'12':{'is_video':False,'file_path':'content/person/original.jpg'}}}
        self.source=types.SimpleNamespace(extract_handle=lambda d:d.get('owner',''),cdn_url=lambda p:'https://cdn.leakgallery.com/'+p)
        self.details={'id':12,'is_video':False,'owner':'person','file_path':'content/person/original.jpg'}
        self.runtime=r.Repair.__new__(r.Repair);self.runtime.s3=Store();self.runtime.bucket='fixture';self.runtime.journal=self.root/'journal.jsonl'
        self.runtime.candidate=lambda expected:copy.deepcopy(self.row)
        self.runtime.photo_source=lambda expected,row:r.validate_source(expected,row,self.details,self.source)
        self.requests=[]
        self.runtime.request=lambda url,stream=False:self.requests.append(url) or Response()
        self.updates=[]
        def update(row,size):self.updates.append((copy.deepcopy(row),size));self.row.update(type='photo',file_size=size)
        self.runtime.update_photo=update
        self.encode=lambda src,dest,ext:Path(dest).write_bytes(b'\xff\xd8\xfffull-resolution-fixture') or {}

    def encoding(self,src,dest,ext):
        self.encode(src,dest,ext)
        return {'bytes':Path(dest).stat().st_size,'sha256':'fixture'}

    def test_dry_run_changes_nothing_and_downloads_nothing(self):
        before=copy.deepcopy(self.row)
        result=self.runtime.run(copy.deepcopy(self.row))
        self.assertEqual(result['status'],'would_reclassify')
        self.assertEqual((self.requests,self.runtime.s3.puts,self.updates),([],[],[]))
        self.assertEqual(self.row,before);self.assertFalse(self.runtime.journal.exists())

    def test_only_video_without_video_url_can_be_repaired(self):
        for values in [{'type':'photo'},{'video_url':'/media/creators/person/12.mp4'},{'video_url':''}]:
            before=copy.deepcopy(self.row);self.row.update(values)
            with self.assertRaises(r.RepairError):self.runtime.run(before,True)
            self.row=before
        self.assertEqual(self.runtime.s3.puts,[])

    def test_hidden_withdrawn_and_changed_identities_are_rejected(self):
        for values in [{'is_hidden':1},{'creator_hidden':1},{'removed_from_index_at':'date'},
                       {'creator_removed':'date'},{'photo_source_id':'99'},{'source_id':99},
                       {'url_version':2},{'minio_key':'creators/person/99.jpg'},
                       {'image_url':'/media/creators/person/99.jpg'}]:
            before=copy.deepcopy(self.row);self.row.update(values)
            with self.assertRaises(r.RepairError):self.runtime.run(before,True)
            self.row=before
        self.assertEqual(self.runtime.s3.puts,[])

    def test_source_requires_false_boolean_same_owner_id_and_audited_full_file(self):
        for values in [{'is_video':True},{'is_video':0},{'is_video':None},{'owner':'other'},
                       {'id':99},{'file_path':'content/person/thumbnail.jpg'},{'removed':True},{'error':'unavailable'}]:
            d={**self.details,**values}
            with self.assertRaises(r.RepairError):r.validate_source(self.row,self.row,d,self.source)
        self.assertEqual(r.validate_source(self.row,self.row,self.details,self.source),'https://cdn.leakgallery.com/content/person/original.jpg')

    def test_apply_changes_only_type_and_size_and_preserves_public_page_identity(self):
        before=copy.deepcopy(self.row)
        with patch.object(r,'reencode_image',side_effect=self.encoding):result=self.runtime.run(before,True)
        self.assertEqual(result['status'],'photo_restored');self.assertEqual(self.row['type'],'photo')
        for key in set(self.row)-{'type','file_size'}:self.assertEqual(self.row[key],before[key],key)
        self.assertEqual(len(self.runtime.s3.puts),1);self.assertEqual(self.runtime.s3.puts[0]['IfNoneMatch'],'*')
        self.assertEqual(self.runtime.s3.puts[0]['Key'],'creators/person/12.jpg')
        self.assertEqual(self.row['file_size'],len(self.runtime.s3.objects['creators/person/12.jpg'][0]))
        self.assertEqual(len(list(self.root.glob('*.before.json'))),1)
        self.assertEqual(self.runtime.journal.stat().st_mode&0o777,0o600)

    def test_existing_object_is_never_overwritten(self):
        key='creators/person/12.jpg';self.runtime.s3.objects[key]=(b'original-image','image/jpeg')
        self.runtime.run(copy.deepcopy(self.row),True)
        self.assertEqual(self.runtime.s3.objects[key],(b'original-image','image/jpeg'))
        self.assertEqual(self.runtime.s3.puts,[]);self.assertEqual(self.requests,[])

    def test_withdrawal_after_download_prevents_upload_and_sql(self):
        calls=[]
        def candidate(expected):
            calls.append(1)
            if len(calls)>1:raise r.RepairError('excluded')
            return copy.deepcopy(self.row)
        self.runtime.candidate=candidate
        with patch.object(r,'reencode_image',side_effect=self.encoding):
            with self.assertRaises(r.RepairError):self.runtime.run(copy.deepcopy(self.row),True)
        self.assertEqual(self.runtime.s3.puts,[]);self.assertEqual(self.updates,[])

    def test_sql_changes_only_type_size_and_guards_identity_and_exclusions(self):
        cur=types.SimpleNamespace(rowcount=1,queries=[])
        cur.execute=lambda sql,args:cur.queries.append((sql,args));cur.close=lambda:None
        counts=[]
        self.runtime.db=types.SimpleNamespace(cursor=lambda:cur,start_transaction=lambda:None,
                      commit=lambda:counts.append('commit'),rollback=lambda:counts.append('rollback'))
        r.Repair.update_photo(self.runtime,self.row,999)
        sql,args=cur.queries[0];assignments=sql.split(' SET ',1)[1].split('WHERE',1)[0].strip()
        self.assertEqual(assignments,"p.type='photo',p.file_size=%s")
        for guard in ['p.video_url IS NULL','p.is_hidden=0','c.is_hidden=0','p.removed_from_index_at IS NULL',
                      'c.removed_from_index_at IS NULL','p.url_version <=> %s','p.source_id <=> %s','b.minio_key=%s']:
            self.assertIn(guard,sql)
        self.assertEqual(counts,['commit']);self.assertEqual(args[1],self.row['id'])

    def test_notice_matching_still_excludes_media_and_creator_targets(self):
        for notice in [{'urls':'https://leakfanhub.com/fr/person/12-v4'},
                       {'targets':'[{"kind":"creator","handle":"person"}]'}]:
            self.assertTrue(r.base.notice_matches(self.row,notice))

    def test_full_image_reencode_has_no_resize_filter(self):
        target=self.root/'output.jpg'
        calls=[]
        def convert(command,**kwargs):calls.append(command);target.write_bytes(b'\xff\xd8\xffneutral')
        with patch.object(r.subprocess,'run',side_effect=convert):r.reencode_image(self.root/'source',target,'.jpg')
        self.assertNotIn('-vf',calls[0]);self.assertNotIn('-s',calls[0]);self.assertNotIn('scale',str(calls[0]))

if __name__=='__main__':unittest.main()
