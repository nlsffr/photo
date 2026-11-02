#!/usr/bin/env python3
"""Small public HTTP canaries. No catalogue, source, audience or repair writes."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import http.client
import json
import os
from pathlib import Path
import re
import socket
import stat
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ORIGIN = 'https://leakfanhub.com'
PAGE_BYTES = 256 * 1024
IMAGE_BYTES = 512
VIDEO_BYTES = 4096
TTL = 1800
RESERVED = {'admin','api','_next','media','sitemaps','creator','photo','tag','en','fr','es','de','it','pt','nl'}


def valid_path(value, asset=False):
    if not isinstance(value, str) or len(value) > 2048 or not value.startswith('/') or value.startswith('//'):
        return False
    if any(ord(char) < 33 for char in value) or re.search(r'%(?:2f|5c)|\\', value, re.I):
        return False
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        return False
    segments = value[1:].split('/')
    if any(not re.fullmatch(r'[A-Za-z0-9._-]+', part) or part in ('.','..') for part in segments):
        return False
    return value.startswith('/media/creators/') if asset else len(segments) == 2 and segments[0].lower() not in RESERVED


def validate_config(value):
    if not isinstance(value, dict) or set(value) != {'version','samples'} or value['version'] != 1:
        raise ValueError('configuration_invalid')
    samples = value['samples']
    if not isinstance(samples, list) or len(samples) != 3:
        raise ValueError('configuration_invalid')
    for sample in samples:
        if not isinstance(sample, dict) or sample.get('kind') not in ('photo','video'):
            raise ValueError('configuration_invalid')
        fields = {'id','kind','page','image'} | ({'video'} if sample['kind'] == 'video' else set())
        if (set(sample) != fields or not isinstance(sample['id'], str)
                or not re.fullmatch(r'[a-z0-9-]{1,40}', sample['id'])
                or not valid_path(sample['page']) or not valid_path(sample['image'], True)
                or (sample['kind'] == 'video' and not valid_path(sample['video'], True))):
            raise ValueError('configuration_invalid')
    if (len({sample['id'] for sample in samples}) != 3 or len({sample['page'] for sample in samples}) != 3
            or sum(sample['kind'] == 'video' for sample in samples) != 2):
        raise ValueError('configuration_invalid')
    return samples


def read_config(path):
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                or info.st_mode & 0o077 or info.st_size > 65536):
            raise ValueError('configuration_unavailable')
        content = stream.read(65537)
    if len(content) > 65536:
        raise ValueError('configuration_unavailable')
    return validate_config(json.loads(content))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        return None


def fetch(path, limit, ranged):
    headers = {'Accept-Encoding':'identity', 'User-Agent':'LeakFanHub-QualityMonitor/1.0',
               'Accept-Language':'en', 'Cache-Control':'no-cache'}
    if ranged:
        headers['Range'] = f'bytes=0-{limit-1}'
    request = urllib.request.Request(ORIGIN + path, headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        try:
            response = opener.open(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            code = response.status
            clean_headers = {key.lower():value for key,value in response.headers.items()}
            body = response.read(limit) if code in (200,206) else b''
            length = clean_headers.get('content-length')
            truncated = len(body) == limit or bool(length and length.isdecimal() and int(length) > limit)
        return {'httpStatus':code, 'headers':clean_headers, 'body':body, 'truncated':truncated, 'error':None}
    except (TimeoutError, socket.timeout):
        reason = 'request_timeout'
    except urllib.error.URLError as error:
        reason = 'request_timeout' if isinstance(error.reason, (TimeoutError, socket.timeout)) else 'request_failed'
    except (OSError, ValueError, http.client.HTTPException):
        reason = 'request_failed'
    return {'httpStatus':None, 'headers':{}, 'body':b'', 'truncated':False, 'error':reason}


def check(stage, reply, status, code):
    return {'stage':stage, 'status':status, 'code':code, 'httpStatus':reply['httpStatus'], 'bytesRead':len(reply['body'])}


def inspect_page(reply):
    def result(status, code):return check('page', reply, status, code)
    if reply['error']:
        return result('unknown', reply['error'])
    if reply['httpStatus'] in (404,410):
        return result('retired', 'sample_retired')
    if reply['httpStatus'] != 200:
        return result('failed', 'page_http_status')
    headers, body = reply['headers'], reply['body'].lower()
    if headers.get('content-type','').split(';',1)[0].strip().lower() != 'text/html':
        return result('failed', 'page_mime_invalid')
    if headers.get('content-encoding','identity').lower() not in ('','identity'):
        return result('unknown', 'page_encoding_unsupported')
    if re.search(br'id\s*=\s*["\']__next_error__["\']', body) or b':e{\\"digest\\":' in body or b':e{"digest":' in body:
        return result('failed', 'page_ssr_error')
    if reply['truncated']:
        return result('unknown', 'page_body_truncated')
    if b'<html' not in body or b'<body' not in body or b'</html>' not in body:
        return result('unknown', 'page_html_incomplete')
    age = headers.get('age')
    if age and (not age.isdecimal() or int(age) > TTL):
        return result('unknown', 'page_cache_unconfirmed')
    return result('passed', 'page_html_verified')


def signature(body, mime):
    if mime == 'image/jpeg':return body.startswith(b'\xff\xd8\xff')
    if mime == 'image/png':return body.startswith(b'\x89PNG\r\n\x1a\n')
    if mime == 'image/webp':return body.startswith(b'RIFF') and body[8:12] == b'WEBP'
    if mime == 'image/gif':return body[:6] in (b'GIF87a',b'GIF89a')
    if mime == 'image/avif':return body[4:8] == b'ftyp' and any(brand in body[8:32] for brand in (b'avif',b'avis'))
    if mime in ('video/mp4','video/quicktime'):return len(body) >= 12 and body[4:8] == b'ftyp'
    if mime == 'video/webm':return body.startswith(b'\x1a\x45\xdf\xa3')
    return False


def inspect_asset(stage, reply, limit):
    def result(status, code):return check(stage, reply, status, code)
    if reply['error']:
        return result('unknown', reply['error'])
    status, body, headers = reply['httpStatus'], reply['body'], reply['headers']
    if stage == 'video' and status == 200:
        return result('failed', 'video_range_ignored')
    if status not in ((206,) if stage == 'video' else (200,206)):
        return result('failed', stage + '_http_status')
    mime = headers.get('content-type','').split(';',1)[0].strip().lower()
    if not mime.startswith(stage + '/'):
        return result('failed', stage + '_mime_invalid')
    if status == 206:
        match = re.fullmatch(r'bytes 0-([0-9]+)/([0-9]+)', headers.get('content-range',''))
        if (not match or not 0 < int(match[1])+1 == len(body) <= limit
                or int(match[1]) >= int(match[2])):
            return result('failed', stage + '_range_invalid')
        length = headers.get('content-length')
        if length is not None and (not length.isdecimal() or int(length) != len(body)):
            return result('failed', stage + '_length_invalid')
    if not signature(body, mime):
        return result('failed', stage + '_signature_invalid')
    return result('passed', stage + '_prefix_verified')


def check_sample(sample, transport):
    checks = [inspect_page(transport(sample['page'], PAGE_BYTES, False))]
    if checks[0]['status'] == 'passed':
        checks.append(inspect_asset('image', transport(sample['image'], IMAGE_BYTES, True), IMAGE_BYTES))
        if sample['kind'] == 'video':
            checks.append(inspect_asset('video', transport(sample['video'], VIDEO_BYTES, True), VIDEO_BYTES))
    states = {row['status'] for row in checks}
    status = ('failed' if 'failed' in states else 'retired' if 'retired' in states
              else 'unknown' if 'unknown' in states else 'passed')
    return {'id':sample['id'], 'kind':sample['kind'], 'status':status, 'checks':checks}


def run(samples, *, fetch=fetch, clock=time.time):
    samples = validate_config({'version':1, 'samples':samples})
    # At most two active requests and exactly eight at most for two videos/photo.
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda sample:check_sample(sample, fetch), samples))
    counts = {'expected':3, **{state:sum(row['status'] == state for row in results) for state in ('passed','failed','retired','unknown')}}
    status = 'degraded' if counts['failed'] else 'healthy' if counts['passed'] == 3 else 'unknown'
    return {'version':1, 'observedAt':dt.datetime.fromtimestamp(clock(),dt.timezone.utc).isoformat().replace('+00:00','Z'),
            'status':status, 'counts':counts, 'samples':results}


def write_report(path, result):
    path = Path(path)
    parent = path.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.geteuid() or parent.st_mode & 0o077:
        raise ValueError('output_directory_unavailable')
    fd, temporary = tempfile.mkstemp(prefix='.quality-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(result,stream);stream.write('\n');stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,path)
        directory = os.open(path.parent, os.O_RDONLY | getattr(os,'O_DIRECTORY',0))
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path('/etc/maison-media-quality/config.json'))
    parser.add_argument('--output', type=Path, default=Path('/var/lib/maison-media-quality/latest.json'))
    args = parser.parse_args()
    try:
        try:result = run(read_config(args.config))
        except (OSError, ValueError):
            result = {'version':1, 'observedAt':dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z'),
                      'status':'unknown', 'counts':{'expected':3,'passed':0,'failed':0,'retired':0,'unknown':3}, 'samples':[]}
        write_report(args.output,result)
        print(json.dumps({'status':result['status'],'counts':result['counts']}))
        return 0
    except (OSError, ValueError):
        print(json.dumps({'status':'unknown','error':'quality_report_unavailable'}))
        return 1


if __name__ == '__main__':raise SystemExit(main())
