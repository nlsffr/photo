import importlib.util
import json
import io
import urllib.error
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('quality_monitor',Path(__file__).resolve().parents[1]/'ops/quality-monitor.py')
quality=importlib.util.module_from_spec(spec);spec.loader.exec_module(quality)


def samples():
    return [{'id':'video-1','kind':'video','page':'/owner/1','image':'/media/creators/owner/1.webp','video':'/media/creators/owner/1.mp4'},
            {'id':'video-2','kind':'video','page':'/owner/2','image':'/media/creators/owner/2.webp','video':'/media/creators/owner/2.mp4'},
            {'id':'photo-1','kind':'photo','page':'/owner/3','image':'/media/creators/owner/3.jpg'}]


def response(status,body,content_type,**headers):
    return {'httpStatus':status,'body':body,'headers':{'content-type':content_type,**headers},'truncated':False,'error':None}


def transport(path,limit,ranged):
    if not ranged:return response(200,b'<!doctype html><html><body>Public fixture</body></html>','text/html')
    if path.endswith('.mp4'):
        body=b'\0\0\0\x18ftypisom';mime='video/mp4'
    elif path.endswith('.webp'):
        body=b'RIFF\x04\0\0\0WEBP';mime='image/webp'
    else:body=b'\xff\xd8\xffimage';mime='image/jpeg'
    return response(206,body,mime,**{'content-range':f'bytes 0-{len(body)-1}/{len(body)+1000}','content-length':str(len(body))})


class QualityTests(unittest.TestCase):
    def test_exact_sample_contract_rejects_external_technical_or_encoded_paths(self):
        config={'version':1,'samples':samples()}
        self.assertEqual(quality.validate_config(config),samples())
        for field,value in [('page','https://private.invalid/owner/1'),('image','//private.invalid/x.jpg'),
                            ('video','/media/creators/x/1.mp4?token=PRIVATE'),('page','/api/private'),
                            ('page','/admin/seo'),('page','/owner%2fsecret/1'),('page','/owner/../1')]:
            bad=json.loads(json.dumps(config));bad['samples'][0][field]=value
            with self.subTest(field=field,value=value):
                with self.assertRaises(ValueError):quality.validate_config(bad)
        with self.assertRaises(ValueError):quality.validate_config({'version':1,'samples':samples()[:2]})

    def test_three_passing_samples_require_exact_eight_bounded_requests(self):
        calls=[]
        def fetch(path,limit,ranged):calls.append((path,limit,ranged));return transport(path,limit,ranged)
        result=quality.run(samples(),fetch=fetch,clock=lambda:1000)
        self.assertEqual(result['status'],'healthy');self.assertEqual(result['counts'],{'expected':3,'passed':3,'failed':0,'retired':0,'unknown':0})
        self.assertEqual(len(calls),8)
        self.assertEqual(sorted(limit for _,limit,ranged in calls if ranged),[512,512,512,4096,4096])
        self.assertNotIn('/owner/',json.dumps(result));self.assertNotIn('Public fixture',json.dumps(result))

    def test_retired_samples_never_fetch_assets_or_claim_healthy(self):
        calls=[]
        def fetch(path,limit,ranged):calls.append(path);return response(410,b'','text/plain')
        result=quality.run(samples(),fetch=fetch,clock=lambda:1000)
        self.assertEqual((result['status'],result['counts']['retired']),('unknown',3));self.assertEqual(len(calls),3)
        self.assertTrue(all(item['checks'][0]['code']=='sample_retired' for item in result['samples']))

    def test_ssr_error_mime_error_and_range_ignored_are_failures(self):
        for broken,expected in [
            (response(200,b'<html id="__next_error__"><body>Error</body></html>','text/html'),'page_ssr_error'),
            (response(200,b'<html><body><script>1:E{\\"digest\\":\\"123\\"}</script></body></html>','text/html'),'page_ssr_error'),
            (response(200,b'<html></html>','application/json'),'page_mime_invalid')]:
            def fetch(path,limit,ranged):return broken if not ranged else transport(path,limit,ranged)
            result=quality.run(samples(),fetch=fetch,clock=lambda:1000)
            self.assertEqual(result['status'],'degraded');self.assertEqual(result['samples'][0]['checks'][0]['code'],expected)
        def fetch(path,limit,ranged):
            value=transport(path,limit,ranged)
            if path.endswith('.mp4'):value['httpStatus']=200
            return value
        result=quality.run(samples(),fetch=fetch,clock=lambda:1000)
        self.assertEqual(result['status'],'degraded');self.assertEqual(result['samples'][0]['checks'][-1]['code'],'video_range_ignored')

    def test_truncated_or_old_cached_page_is_unknown_and_assets_not_fetched(self):
        for field,value in [('truncated',True),('age','1801')]:
            calls=[]
            def fetch(path,limit,ranged):
                calls.append(path);reply=transport(path,limit,ranged)
                if field=='truncated':reply[field]=value
                else:reply['headers'][field]=value
                return reply
            result=quality.run(samples(),fetch=fetch,clock=lambda:1000)
            self.assertEqual(result['status'],'unknown');self.assertEqual(len(calls),3)

    def test_asset_signature_and_content_range_must_match_bounded_body(self):
        for mutation in ('signature','mime','range','length'):
            def fetch(path,limit,ranged):
                reply=transport(path,limit,ranged)
                if path.endswith('.mp4'):
                    if mutation=='signature':reply['body']=b'PRIVATE_ERROR'
                    elif mutation=='mime':reply['headers']['content-type']='text/html'
                    elif mutation=='range':reply['headers']['content-range']='bytes 1-12/100'
                    else:reply['headers']['content-length']='99999'
                return reply
            result=quality.run(samples(),fetch=fetch,clock=lambda:1000)
            self.assertEqual(result['status'],'degraded');self.assertNotIn('PRIVATE_ERROR',json.dumps(result))

    def test_fetch_concurrency_never_exceeds_two(self):
        lock=threading.Lock();active=0;peak=0
        def fetch(path,limit,ranged):
            nonlocal active,peak
            with lock:active+=1;peak=max(peak,active)
            time.sleep(.005)
            with lock:active-=1
            return transport(path,limit,ranged)
        self.assertEqual(quality.run(samples(),fetch=fetch,clock=lambda:1000)['status'],'healthy')
        self.assertEqual(peak,2)

    def test_atomic_private_report_and_private_config_reject_symlinks(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);root.chmod(0o700);config=root/'config.json';config.write_text(json.dumps({'version':1,'samples':samples()}));config.chmod(0o600)
            self.assertEqual(quality.read_config(config),samples())
            link=root/'link';link.symlink_to(config)
            with self.assertRaises((OSError,ValueError)):quality.read_config(link)
            config.chmod(0o644)
            with self.assertRaises(ValueError):quality.read_config(config)
            output=root/'latest.json';result=quality.run(samples(),fetch=transport,clock=lambda:1000);quality.write_report(output,result)
            self.assertEqual(json.loads(output.read_text()),result);self.assertEqual(output.stat().st_mode&0o777,0o600)
            self.assertEqual(sorted(path.name for path in root.iterdir()),['config.json','latest.json','link'])

    def test_transport_errors_and_redirects_are_bounded_and_never_echo_secrets(self):
        for status in (302,404):
            body=io.BytesIO(b'PRIVATE_PASSWORD')
            error=urllib.error.HTTPError('https://PRIVATE.invalid',status,'PRIVATE_MESSAGE',
                {'Location':'https://PRIVATE.invalid/?token=PRIVATE'},body)
            opener=unittest.mock.Mock();opener.open.side_effect=error
            with patch.object(quality.urllib.request,'build_opener',return_value=opener):
                reply=quality.fetch('/owner/1',quality.PAGE_BYTES,False)
            self.assertEqual(opener.open.call_count,1);self.assertEqual(reply['httpStatus'],status)
            self.assertEqual(reply['body'],b'');self.assertTrue(body.closed)
            result=quality.inspect_page(reply)
            self.assertNotIn('PRIVATE',json.dumps(result))
        self.assertIsNone(quality.NoRedirect().redirect_request(None,None,302,'private',{},'https://PRIVATE.invalid'))
        opener=unittest.mock.Mock();opener.open.side_effect=urllib.error.URLError(TimeoutError('PRIVATE_PASSWORD'))
        with patch.object(quality.urllib.request,'build_opener',return_value=opener):
            reply=quality.fetch('/owner/1',quality.PAGE_BYTES,False)
        self.assertEqual(opener.open.call_count,1)
        self.assertEqual(quality.inspect_page(reply)['code'],'request_timeout')
        self.assertNotIn('PRIVATE',json.dumps(quality.inspect_page(reply)))

    def test_transport_reads_once_to_requested_limit_without_redirect_or_retry(self):
        class Reply:
            status=206
            headers={'Content-Type':'video/mp4','Content-Length':'100000'}
            def __enter__(self):return self
            def __exit__(self,*args):self.closed=True
            def read(self,limit):self.read_limit=limit;return b'x'*limit
        reply=Reply()
        class Opener:
            def open(self,request,timeout):
                self.request=request;self.timeout=timeout;return reply
        opener=Opener()
        with patch.object(quality.urllib.request,'build_opener',return_value=opener):
            result=quality.fetch('/media/creators/owner/1.mp4',4096,True)
        self.assertEqual(reply.read_limit,4096);self.assertTrue(reply.closed)
        self.assertEqual(opener.request.full_url,'https://leakfanhub.com/media/creators/owner/1.mp4')
        self.assertEqual(opener.request.get_header('Range'),'bytes=0-4095');self.assertTrue(result['truncated'])


if __name__=='__main__':unittest.main()
