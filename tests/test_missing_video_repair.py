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
        return {'ContentLength':len(self.objects[Key]),'ContentType':'image/webp' if Key.endswith('.webp') else 'video/mp4'}
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
        self.runtime.poster_updates=[]
        def update_poster(row,url,size):
            self.runtime.poster_updates.append((copy.deepcopy(row),url,size));self.row['image_url']=url;self.row['file_size']=size
        self.runtime.update_poster=update_poster

    def legacy(self):
        self.row['image_url']=self.row['video_url']
        return copy.deepcopy(self.row)

    def test_missing_poster_reference_derives_an_image_for_null_or_empty_fields(self):
        for image in (None, ""):
            for preview in (None, ""):
                with self.subTest(image=image, preview=preview):
                    expected={**self.row, 'image_url':image, 'preview_url':preview}
                    self.assertEqual(repair.legacy_poster_url(expected), '/media/creators/person/12_thumb.webp')
                    self.assertEqual(repair.validate_candidate(expected,expected),
                                     ('creators/person/12.mp4','creators/person/12_thumb.webp'))
                    replay={**expected,'image_url':'/media/creators/person/12_thumb.webp'}
                    self.assertEqual(repair.validate_candidate(expected,replay)[1],'creators/person/12_thumb.webp')
                    changed={**replay,'image_url':'/media/creators/person/other.webp'}
                    with self.assertRaises(repair.RepairError):repair.validate_candidate(expected,changed)

    def test_missing_poster_reference_never_replaces_a_different_existing_reference(self):
        for image,preview in [('/media/creators/person/custom.jpg',None),
                              (None,'/media/creators/person/preview.webp'),
                              ('/media/creators/person/other.mp4',None),
                              ('https://unrelated.example/thumb.jpg',None)]:
            self.assertIsNone(repair.legacy_poster_url({**self.row,'image_url':image,'preview_url':preview}))

    def test_null_poster_existing_file_repair_preserves_identity_and_replays(self):
        self.row['image_url']=None
        expected=copy.deepcopy(self.row)
        self.runtime.s3.objects={'creators/person/12.mp4':b'video','creators/person/12_thumb.webp':b'image'}
        dry=self.runtime.run(expected,False)
        self.assertEqual(dry['status'],'would_restore');self.assertTrue(dry['poster_metadata_change'])
        self.assertEqual(self.row,expected);self.assertEqual(self.runtime.poster_updates,[])
        result=self.runtime.run(expected,True)
        self.assertEqual(result['status'],'restored')
        self.assertEqual(self.row['image_url'],'/media/creators/person/12_thumb.webp')
        self.assertEqual(self.runtime.downloads,[]);self.assertEqual(self.runtime.s3.puts,[])
        for field in ('id','source_id','photo_source_id','video_url','preview_url','url_version'):
            self.assertEqual(self.row[field],expected[field])
        self.assertEqual(self.runtime.run(expected,True)['status'],'already_present')
        self.assertEqual(len(self.runtime.poster_updates),1)

    def test_legacy_video_thumbnail_derives_image_and_allows_only_exact_replay(self):
        expected=self.legacy()
        self.assertEqual(repair.validate_candidate(expected,self.row),('creators/person/12.mp4','creators/person/12_thumb.webp'))
        self.row['image_url']='/media/creators/person/12_thumb.webp'
        self.assertEqual(repair.validate_candidate(expected,self.row)[1],'creators/person/12_thumb.webp')
        self.row['image_url']='/media/creators/person/other_thumb.webp'
        with self.assertRaises(repair.RepairError):repair.validate_candidate(expected,self.row)
        self.row=copy.deepcopy(expected);self.row['preview_url']='/media/creators/person/preview.webp'
        with self.assertRaises(repair.RepairError):repair.validate_candidate(self.row,self.row)
        absolute={**expected,'video_url':'https://leakfanhub.com/media/creators/person/12.mov',
                  'image_url':'https://leakfanhub.com/media/creators/person/12.mov','minio_key':'creators/person/12.mov'}
        self.assertEqual(repair.legacy_poster_url(absolute),'https://leakfanhub.com/media/creators/person/12_thumb.webp')

    def test_legacy_existing_assets_repair_metadata_without_downloading(self):
        expected=self.legacy();self.runtime.s3.objects={'creators/person/12.mp4':b'video','creators/person/12_thumb.webp':b'image'}
        result=self.runtime.run(expected,True)
        self.assertEqual(result['status'],'restored');self.assertEqual(self.runtime.downloads,[])
        self.assertEqual(self.row['image_url'],'/media/creators/person/12_thumb.webp')
        self.assertEqual(len(self.runtime.poster_updates),1)
        for field in ('id','video_url','preview_url','source_id','photo_source_id','url_version'):
            self.assertEqual(self.row[field],expected[field])
        self.assertEqual(self.row['file_size'],5)

    def test_legacy_dry_run_does_not_change_metadata_with_existing_assets(self):
        expected=self.legacy();self.runtime.s3.objects={'creators/person/12.mp4':b'video','creators/person/12_thumb.webp':b'image'}
        result=self.runtime.run(expected,False)
        self.assertEqual(result['status'],'would_restore');self.assertTrue(result['poster_metadata_change'])
        self.assertEqual(self.row,expected);self.assertEqual(self.runtime.poster_updates,[])

    def test_legacy_upload_then_replay_preserves_video_and_page_identity(self):
        expected=self.legacy();self.runtime.s3.objects['creators/person/12.mp4']=b'video'
        def poster(input_path,output_path,extension):Path(output_path).write_bytes(b'RIFF0000WEBPfixture')
        with patch.object(repair,'make_poster',side_effect=poster):result=self.runtime.run(expected,True)
        self.assertEqual(result['status'],'restored');self.assertEqual(self.runtime.s3.objects['creators/person/12.mp4'],b'video')
        self.assertEqual([p['Key'] for p in self.runtime.s3.puts],['creators/person/12_thumb.webp'])
        self.assertEqual(self.runtime.run(expected,True)['status'],'already_present')
        self.assertEqual(len(self.runtime.poster_updates),1)

    def test_legacy_bad_existing_poster_is_not_published(self):
        expected=self.legacy();self.runtime.s3.objects={'creators/person/12.mp4':b'video','creators/person/12_thumb.webp':b'bad'}
        old=self.runtime.s3.head_object
        def wrong(**kwargs):
            result=old(**kwargs)
            if kwargs['Key'].endswith('.webp'):result['ContentType']='video/mp4'
            return result
        self.runtime.s3.head_object=wrong
        with self.assertRaises(repair.RepairError):self.runtime.run(expected,True)
        self.assertEqual(self.runtime.poster_updates,[]);self.assertEqual(self.row,expected)

    def test_legacy_withdrawal_after_upload_prevents_metadata_update(self):
        expected=self.legacy();self.runtime.s3.objects['creators/person/12.mp4']=b'video';calls=[]
        def candidate(expected):
            calls.append(1)
            if len(calls)>=4:raise repair.RepairError('notice_excluded')
            return copy.deepcopy(self.row)
        self.runtime.candidate=candidate
        def poster(input_path,output_path,extension):Path(output_path).write_bytes(b'RIFF0000WEBPfixture')
        with patch.object(repair,'make_poster',side_effect=poster):
            with self.assertRaises(repair.RepairError):self.runtime.run(expected,True)
        self.assertEqual(self.runtime.poster_updates,[]);self.assertEqual(self.row,expected)
        self.assertEqual([p['Key'] for p in self.runtime.s3.puts],['creators/person/12_thumb.webp'])

    def test_source_video_type_and_returned_id_must_be_exact(self):
        details={'id':12,'is_video':True,'file_path':'file.mp4','thumbnail_path':'thumb.jpg'}
        self.runtime.source=types.SimpleNamespace(Config=types.SimpleNamespace(BASE_URL='https://api.leakgallery.com'),
            extract_handle=lambda d:d.get('handle','person'),cdn_url=lambda path:'https://cdn.leakgallery.com/'+path if path else '')
        def request(url):
            response=Mock(status_code=200);response.json.return_value=details
            context=Mock();context.__enter__=Mock(return_value=response);context.__exit__=Mock(return_value=False)
            return context
        self.runtime.request=request
        self.assertIn('video',repair.Repair.details(self.runtime,self.row))
        for update in [{'is_video':False},{'is_video':1},{'is_video':None},{'id':13},{'id':None},{'handle':'other'}]:
            current={**details,**update};old=details;details=current
            with self.assertRaises(repair.RepairError):repair.Repair.details(self.runtime,self.row)
            details=old

    def test_poster_metadata_sql_guards_original_identity_and_registry(self):
        row=self.legacy();row['creator_id']='fixture-creator';cur=Mock(rowcount=1);db=Mock();db.cursor.return_value=cur
        self.runtime.db=db
        repair.Repair.update_poster(self.runtime,row,'/media/creators/person/12_thumb.webp',5)
        sql,params=cur.execute.call_args.args
        self.assertIn('SET p.image_url=%s,p.file_size=%s',sql)
        for guard in ["p.type='video'",'p.video_url=%s','p.image_url <=> %s','p.preview_url <=> %s','p.url_version <=> %s','p.source_id <=> %s','p.file_size <=> %s','b.source_id=%s AND b.photo_id=p.id','b.minio_key=%s']:
            self.assertIn(guard,sql)
        self.assertIn(row['image_url'],params);db.commit.assert_called_once();db.rollback.assert_not_called()

    def test_poster_metadata_concurrent_change_rolls_back(self):
        row=self.legacy();row['creator_id']='fixture-creator';cur=Mock(rowcount=0);db=Mock();db.cursor.return_value=cur
        self.runtime.db=db
        with self.assertRaisesRegex(repair.RepairError,'metadata_changed'):
            repair.Repair.update_poster(self.runtime,row,'/media/creators/person/12_thumb.webp',5)
        db.rollback.assert_called_once();db.commit.assert_not_called()

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
