"""Bounded asset repair: no live network, database or media are used."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

MODULE = Path(__file__).resolve().parents[1]/'ops/repair-missing-video-assets.py'
spec=importlib.util.spec_from_file_location('video_repair',MODULE)
repair=importlib.util.module_from_spec(spec);spec.loader.exec_module(repair)

class StoreError(Exception):
    def __init__(self,status):self.response={'ResponseMetadata':{'HTTPStatusCode':status}}

class Store:
    def __init__(self):self.objects={};self.puts=[]
    def head_object(self,Bucket,Key):
        if Key not in self.objects:raise StoreError(404)
        return {'ContentLength':len(self.objects[Key])}
    def put_object(self,**kwargs):
        self.puts.append({k:v for k,v in kwargs.items() if k!='Body'})
        assert kwargs['IfNoneMatch']=='*'
        if kwargs['Key'] in self.objects:raise StoreError(412)
        self.objects[kwargs['Key']]=kwargs['Body'].read()

class Response:
    def __init__(self,body,mime='video/mp4',length=None,status=200):
        self.body=body;self.status_code=status;self.headers={'Content-Type':mime}
        if length is not None:self.headers['Content-Length']=str(length)
    def iter_content(self,size):yield self.body

class RepairTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.row={'id':'fixture-id','source_id':12,'photo_source_id':None,'minio_key':'creators/person/12.mp4',
                  'video_url':'/media/creators/person/12.mp4','image_url':'/media/creators/person/12_thumb.webp',
                  'preview_url':None,'url_version':1,'file_size':0,'handle':'person','is_hidden':0,'creator_hidden':0,
                  'removed_from_index_at':None,'creator_removed':None}
        self.runtime=repair.Repair.__new__(repair.Repair);self.runtime.bucket='fixture';self.runtime.s3=Store()
        self.runtime.journal=self.root/'journal.jsonl';self.runtime.updates=[];self.runtime.downloads=[]
        self.runtime.candidate=lambda expected:copy.deepcopy(self.row)
        self.runtime.details=lambda row:{'video':'https://cdn.leakgallery.com/file.mp4','poster':'https://cdn.leakgallery.com/thumb.jpg'}
        def download(url,destination,image=False):
            self.runtime.downloads.append(url)
            body=b'\xff\xd8\xfffixture-image' if image else b'\0\0\0\x18ftypisomfixture-video'
            Path(destination).write_bytes(body)
            return {'bytes':len(body),'sha256':'fixture-digest'}
        self.runtime.download=download
        def update(row,size):self.runtime.updates.append((copy.deepcopy(row),size));self.row['file_size']=size
        self.runtime.update_size=update

    def test_dry_run_makes_no_upload_download_or_metadata_change(self):
        before=copy.deepcopy(self.row)
        result=self.runtime.run(copy.deepcopy(self.row),False)
        self.assertEqual(result['status'],'would_restore')
        self.assertEqual((self.runtime.s3.puts,self.runtime.downloads,self.runtime.updates),([],[],[]))
        self.assertEqual(self.row,before);self.assertFalse(self.runtime.journal.exists())

    def test_hidden_or_changed_candidates_never_reach_storage(self):
        for field,value in [('is_hidden',1),('creator_removed','2026-01-01')]:
            expected=copy.deepcopy(self.row);self.row[field]=value
            with self.assertRaises(repair.RepairError):self.runtime.run(expected,True)
            self.row[field]=expected[field]
        expected=copy.deepcopy(self.row);self.row['video_url']='/media/creators/person/99.mp4'
        with self.assertRaises(repair.RepairError):self.runtime.run(expected,True)
        self.assertEqual(self.runtime.s3.puts,[])

    def test_html_and_spoofed_video_are_rejected(self):
        for response in [Response(b'<html>error</html>','text/html'),Response(b'<html>error</html>','video/mp4')]:
            with self.assertRaises(repair.RepairError):repair.response_download(response,self.root/'bad',1024)
            (self.root/'bad').unlink(missing_ok=True)

    def test_size_and_incomplete_transfer_are_rejected(self):
        for response,limit in [(Response(b'\0\0\0\x18ftypisom'+b'x'*100),20),
                               (Response(b'\0\0\0\x18ftypisom',length=100),1000),
                               (Response(b'none',length=2000),1000)]:
            with self.assertRaises(repair.RepairError):repair.response_download(response,self.root/'bad',limit)
            (self.root/'bad').unlink(missing_ok=True)

    def test_conditional_put_preserves_object_created_after_head(self):
        path=self.root/'video';path.write_bytes(b'new')
        self.runtime.s3.objects['key']=b'original'
        self.assertFalse(repair.put_missing(self.runtime.s3,'fixture','key',path,'video/mp4'))
        self.assertEqual(self.runtime.s3.objects['key'],b'original')
        self.assertEqual(self.runtime.s3.puts[0]['IfNoneMatch'],'*')

    def test_apply_keeps_uuid_url_source_id_and_version(self):
        before=copy.deepcopy(self.row)
        def poster(input_path,output_path,extension):Path(output_path).write_bytes(b'RIFF0000WEBPfixture')
        with patch.object(repair,'probe_video',return_value={'duration':2,'codec':'h264','format':'mov,mp4'}),patch.object(repair,'make_poster',side_effect=poster):
            result=self.runtime.run(copy.deepcopy(self.row),True)
        self.assertEqual(result['status'],'restored')
        for field in ('id','video_url','image_url','preview_url','source_id','photo_source_id','url_version'):
            self.assertEqual(self.row[field],before[field])
        self.assertGreater(self.row['file_size'],0)
        self.assertEqual(len(self.runtime.s3.puts),2)
        self.assertEqual(self.runtime.journal.stat().st_mode&0o777,0o600)
        self.assertEqual(len(list(self.root.glob('*.before.json'))),1)

    def test_existing_video_is_never_overwritten_when_poster_is_missing(self):
        key='creators/person/12.mp4';self.runtime.s3.objects[key]=b'existing-valid-file'
        def poster(input_path,output_path,extension):Path(output_path).write_bytes(b'RIFF0000WEBPfixture')
        with patch.object(repair,'make_poster',side_effect=poster):self.runtime.run(copy.deepcopy(self.row),True)
        self.assertEqual(self.runtime.s3.objects[key],b'existing-valid-file')
        self.assertEqual([x['Key'] for x in self.runtime.s3.puts],['creators/person/12_thumb.webp'])
        self.assertEqual(self.runtime.downloads,['https://cdn.leakgallery.com/thumb.jpg'])

    def test_withdrawal_during_download_prevents_both_uploads(self):
        calls=[]
        def candidate(expected):
            calls.append(1)
            if len(calls)>1:raise repair.RepairError('excluded')
            return copy.deepcopy(self.row)
        self.runtime.candidate=candidate
        def poster(input_path,output_path,extension):Path(output_path).write_bytes(b'RIFF0000WEBPfixture')
        with patch.object(repair,'probe_video',return_value={'duration':2,'codec':'h264','format':'mov,mp4'}),patch.object(repair,'make_poster',side_effect=poster):
            with self.assertRaises(repair.RepairError):self.runtime.run(copy.deepcopy(self.row),True)
        self.assertEqual(self.runtime.s3.puts,[]);self.assertEqual(self.runtime.updates,[])

    def test_notice_matching_covers_versioned_pages_and_asset_urls(self):
        for url in ['https://leakfanhub.com/person/12-v3','https://leakfanhub.com/media/creators/person/12.mp4']:
            self.assertTrue(repair.notice_matches(self.row,{'urls':'["'+url.replace('/','\\/')+'"]'}))
        self.assertFalse(repair.notice_matches(self.row,{'urls':'https://leakfanhub.com/person/123'}))

    def test_creator_notices_do_not_match_another_media_page(self):
        row={**self.row,'creator_id':'creator-fixture'}
        for notice in [
            {'urls':'["https://leakfanhub.com/person-v4"]'},
            {'urls':'https://leakfanhub.com/fr/person'},
            {'targets':'[{"kind":"creator","handle":"person"}]'},
            {'targets':'[{"kind":"creator","id":"creator-fixture"}]'},
        ]:
            self.assertTrue(repair.notice_matches(row,notice),notice)
        for notice in [
            {'urls':'https://leakfanhub.com/person/999'},
            {'urls':'https://unrelated.example/person'},
            {'targets':'[{"kind":"photo","id":"other","handle":"person"}]'},
        ]:
            self.assertFalse(repair.notice_matches(row,notice),notice)

    def test_photo_source_id_change_is_rejected(self):
        expected=copy.deepcopy(self.row);self.row['photo_source_id']=12
        with self.assertRaises(repair.RepairError):self.runtime.run(expected,True)
        self.assertFalse(self.runtime.s3.puts)

    def test_source_urls_reject_internal_and_unrelated_hosts(self):
        for url in ['http://cdn.leakgallery.com/x','https://127.0.0.1/x','https://leakgallery.com.attacker.test/x','https://name:password@cdn.leakgallery.com/x']:
            with self.assertRaises(repair.RepairError):repair.source_url(url)

    def test_direct_transport_is_opt_in_and_limited_to_public_cdn_downloads(self):
        response = Mock(status_code=200)
        route = {'https': 'fixture-existing-route'}
        self.runtime.bot = types.SimpleNamespace(session=Mock(), get_proxy=lambda: route)
        self.runtime.bot.session.get.return_value = response
        for enabled, url, stream, expected in [
            (True, 'https://cdn.leakgallery.com/file.mp4', True, None),
            (True, 'https://api.leakgallery.com/media/12', False, route),
            (True, 'https://other.leakgallery.com/file.mp4', True, route),
            (False, 'https://cdn.leakgallery.com/file.mp4', True, route),
        ]:
            self.runtime.direct_cdn = enabled
            self.runtime.request(url, stream=stream)
            self.assertEqual(self.runtime.bot.session.get.call_args.kwargs['proxies'], expected)

    def test_cdn_refusal_does_not_retry_another_route(self):
        response = Mock(status_code=403)
        self.runtime.bot = types.SimpleNamespace(session=Mock(), get_proxy=Mock())
        self.runtime.bot.session.get.return_value = response
        self.runtime.direct_cdn = True
        self.assertIs(self.runtime.request('https://cdn.leakgallery.com/file.mp4', stream=True), response)
        self.assertEqual(self.runtime.bot.session.get.call_count, 1)
        self.runtime.bot.get_proxy.assert_not_called()

if __name__=='__main__':unittest.main()
