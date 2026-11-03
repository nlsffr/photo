#!/usr/bin/env python3
"""Aggregate the dedicated Nginx marker. Existing Docker log data is never retained."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import sqlite3
import stat
import subprocess
import tempfile
import time
from zoneinfo import ZoneInfo

PARIS = ZoneInfo('Europe/Paris')
MARKER = re.compile(r'MAISON_PAGE_V1 ([0-9]{10})[.]([0-9]{3}) (document|flight)\n?\Z')
MAX_BYTES = 1024 * 1024
MAX_RECORD = 65536
MAX_FILES = 32
MAX_SOURCES = 4096
RETENTION = 7 * 86400

class CounterError(RuntimeError):pass

def iso(stamp):return dt.datetime.fromtimestamp(stamp,dt.timezone.utc).isoformat().replace('+00:00','Z')

def period_windows(now):
    local = dt.datetime.fromtimestamp(now,PARIS)
    today = dt.datetime.combine(local.date(),dt.time(),PARIS).timestamp()
    yesterday = dt.datetime.combine(local.date()-dt.timedelta(days=1),dt.time(),PARIS).timestamp()
    end = int(now//60)*60
    return {'today':(today,end),'yesterday':(yesterday,today),'last24h':(end-86400,end)}

def inspect_source(container):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}',container):raise CounterError('container_invalid')
    template='{"id":{{json .Id}},"path":{{json .LogPath}},"driver":{{json .HostConfig.LogConfig.Type}}}'
    result=subprocess.run(['docker','--host','unix:///var/run/docker.sock','inspect','--format',template,container],capture_output=True,timeout=5)
    if result.returncode or len(result.stdout)>4096:raise CounterError('source_inspection_failed')
    try:return validate_source(json.loads(result.stdout))
    except (ValueError,TypeError):raise CounterError('source_inspection_failed') from None

def validate_source(source):
    if (not isinstance(source,dict) or source.get('driver')!='json-file'
            or not re.fullmatch(r'[a-f0-9]{64}',source.get('id',''))):raise CounterError('source_invalid')
    path=Path(source.get('path',''))
    if not path.is_absolute() or path.name!=source['id']+'-json.log' or path.parent.name!=source['id']:
        raise CounterError('source_invalid')
    return {**source,'path':str(path)}

def files_for(source):
    source=validate_source(source);current=Path(source['path']);found={}
    for path in current.parent.iterdir():
        suffix=path.name.removeprefix(current.name)
        if not path.name.startswith(current.name) or not re.fullmatch(r'(?:[.][1-9][0-9]*(?:[.]gz)?)?',suffix):continue
        info=path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid():raise CounterError('log_file_invalid')
        found[(source['id'],info.st_dev,info.st_ino)]={'path':path,'info':info,'active':path==current,'compressed':path.suffix=='.gz'}
        if len(found)>MAX_FILES:raise CounterError('log_file_limit')
    if not any(row['active'] for row in found.values()):raise CounterError('active_log_missing')
    return found

def source_anchor(path,offset,key):
    if not offset:return hashlib.sha256(b'').hexdigest()
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        info=os.fstat(fd)
        if (info.st_dev,info.st_ino)!=(key[1],key[2]):raise CounterError('log_identity_changed')
        size=min(64,offset)
        raw=os.pread(fd,size,offset-size)
        if len(raw)!=size:raise CounterError('log_anchor_unavailable')
        return hashlib.sha256(raw).hexdigest()
    finally:os.close(fd)

def write_report(path,report):
    path=Path(path);fd,temp=tempfile.mkstemp(prefix='.pages-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as stream:
            os.fchmod(stream.fileno(),0o600);json.dump(report,stream);stream.write('\n');stream.flush();os.fsync(stream.fileno())
        os.replace(temp,path)
        directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if os.path.exists(temp):os.unlink(temp)

class Counter:
    def __init__(self,root,*,clock=time.time):
        self.root=Path(root);self.clock=clock;self.root.mkdir(mode=0o700,parents=True,exist_ok=True)
        info=self.root.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&0o077:raise CounterError('state_not_private')
        self.lock=os.open(self.root/'collector.lock',os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
        try:fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:os.close(self.lock);raise CounterError('already_running') from None
        path=self.root/'counter.sqlite3'
        if path.exists():
            info=path.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or info.st_mode&0o077:
                os.close(self.lock);raise CounterError('state_not_private')
        previous=os.umask(0o077)
        try:
            self.db=sqlite3.connect(path,isolation_level=None,timeout=.2);self.db.row_factory=sqlite3.Row
            self.db.execute('PRAGMA journal_mode=WAL');self.db.execute('PRAGMA synchronous=FULL')
            self.db.executescript('''CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sources(container TEXT,dev INTEGER,ino INTEGER,path TEXT,
                  offset INTEGER NOT NULL,size_seen INTEGER NOT NULL,mtime_ns INTEGER NOT NULL,anchor TEXT NOT NULL,active INTEGER NOT NULL,closed INTEGER NOT NULL,
                  PRIMARY KEY(container,dev,ino));
                CREATE TABLE IF NOT EXISTS buckets(minute INTEGER PRIMARY KEY,document INTEGER NOT NULL,flight INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS gaps(start REAL NOT NULL,end REAL NOT NULL,reason TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS gaps_reason_end ON gaps(reason,end);
                CREATE INDEX IF NOT EXISTS gaps_end_start ON gaps(end,start);''')
        finally:os.umask(previous)
        self.last_read_bytes=0;self.state='unavailable';self.issues=[]
    def close(self):
        self.db.close();os.close(self.lock)
    def meta(self,key,default=None):
        row=self.db.execute('SELECT value FROM meta WHERE key=?',(key,)).fetchone();return row[0] if row else default
    def set_meta(self,key,value):self.db.execute('INSERT OR REPLACE INTO meta VALUES(?,?)',(key,str(value)))
    def gap(self,reason,now):
        if reason in self._poll_gaps:return
        self._poll_gaps.add(reason)
        start=max(float(self.meta('started_at',now)),float(self.meta('last_complete',now)))
        previous=self.db.execute('SELECT rowid,end FROM gaps WHERE reason=? ORDER BY end DESC LIMIT 1',(reason,)).fetchone()
        if previous and previous['end']>=start:
            self.db.execute('UPDATE gaps SET end=? WHERE rowid=?',(max(now,previous['end']),previous['rowid']))
        else:self.db.execute('INSERT INTO gaps VALUES(?,?,?)',(start,now,reason))
    def poll(self,source,*,max_bytes=MAX_BYTES):
        if type(max_bytes) is not int or not 128<=max_bytes<=MAX_BYTES:raise CounterError('read_budget_invalid')
        source=validate_source(source);now=self.clock();entries=files_for(source);self.last_read_bytes=0;self._poll_gaps=set()
        known=list(self.db.execute('SELECT * FROM sources LIMIT ?', (MAX_SOURCES+1,)))
        if len(known)>MAX_SOURCES:raise CounterError('source_cursor_limit')
        started=self.meta('started_at')
        # An old container can still have a readable final log after replacement.
        previous_containers={row['container']:row for row in known if row['container']!=source['id'] and not row['closed']}
        if len(previous_containers)>3:raise CounterError('source_cursor_limit')
        for row in previous_containers.values():
            previous={'id':row['container'],'driver':'json-file','path':str(Path(row['path']).parent/(row['container']+'-json.log'))}
            try:
                previous_files=files_for(previous)
                # A renamed/replaced container can still finish requests. Its
                # current file stays watched; EOF alone is not writer closure.
                entries.update(previous_files)
            except (OSError,CounterError):pass
        if len(set((row['container'],row['dev'],row['ino']) for row in known)|set(entries))>MAX_SOURCES:
            raise CounterError('source_cursor_limit')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            if started is None:
                self.set_meta('started_at',now)
                for key,item in entries.items():
                    size=item['info'].st_size
                    self.db.execute('INSERT INTO sources VALUES(?,?,?,?,?,?,?,?,?,?)',(*key,str(item['path']),size,size,item['info'].st_mtime_ns,'' if item['compressed'] else source_anchor(item['path'],size,key),int(item['active']),int(not item['active'])))
                self.set_meta('last_complete',now);self.set_meta('last_poll',now)
                self.db.execute('COMMIT');self.state='available';self.issues=[]
                return self.snapshot()
            original={(row['container'],row['dev'],row['ino']):row for row in known}
            truncated=set()
            for key,row in original.items():
                if key not in entries and not row['closed']:
                    self.gap('log_continuity_lost',now)
                    self.db.execute('UPDATE sources SET active=0,closed=1 WHERE container=? AND dev=? AND ino=?',key)
                elif key in entries and not entries[key]['compressed']:
                    info=entries[key]['info']
                    if (info.st_size<row['offset'] or (info.st_size==row['size_seen'] and info.st_mtime_ns!=row['mtime_ns'])
                            or source_anchor(entries[key]['path'],row['offset'],key)!=row['anchor']):
                        self.gap('log_truncated',now);truncated.add(key[0])
            backlog=False;deadline=time.monotonic()+.25
            for key,item in entries.items():
                info=item['info'];row=original.get(key);offset=row['offset'] if row else 0
                if key[0] in truncated:
                    offset=info.st_size  # Unknown copied/truncated bytes never get replayed.
                if item['compressed']:
                    if row is None:self.gap('compressed_log_unreadable',now)
                    offset=info.st_size
                if row is None:
                    self.db.execute('INSERT INTO sources VALUES(?,?,?,?,?,?,?,?,?,?)',(*key,str(item['path']),offset,info.st_size,info.st_mtime_ns,'' if item['compressed'] else source_anchor(item['path'],offset,key),int(item['active']),int(item['compressed'])))
                if not item['compressed'] and offset<info.st_size:
                    remaining=max_bytes-self.last_read_bytes
                    if remaining<=0 or time.monotonic()>=deadline:backlog=True
                    else:
                        fd=os.open(item['path'],os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
                        try:
                            actual=os.fstat(fd)
                            if (actual.st_dev,actual.st_ino)!=(key[1],key[2]):raise CounterError('log_identity_changed')
                            raw=os.pread(fd,min(remaining,info.st_size-offset),offset)
                        finally:os.close(fd)
                        self.last_read_bytes+=len(raw);consumed=0
                        for line in raw.splitlines(keepends=True):
                            if not line.endswith(b'\n'):break
                            if time.monotonic()>=deadline:break
                            if len(line)>MAX_RECORD:self.gap('log_record_too_large',now)
                            else:self.consume(line,now)
                            consumed+=len(line)
                        if not consumed and len(raw)>=MAX_RECORD:
                            self.gap('log_record_too_large',now);offset=info.st_size
                        else:offset+=consumed
                        if offset<info.st_size:backlog=True
                if row and key[0] not in truncated and not item['compressed'] and source_anchor(item['path'],row['offset'],key)!=row['anchor']:
                    raise CounterError('log_changed_during_read')
                anchor='' if item['compressed'] else source_anchor(item['path'],offset,key)
                closed=int(item['compressed'] or (not item['active'] and offset>=info.st_size))
                self.db.execute('UPDATE sources SET path=?,offset=?,size_seen=?,mtime_ns=?,anchor=?,active=?,closed=? WHERE container=? AND dev=? AND ino=?',
                    (str(item['path']),offset,info.st_size,info.st_mtime_ns,anchor,int(item['active']),closed,*key))
            self.set_meta('last_poll',now)
            if not backlog:self.set_meta('last_complete',now)
            self.db.execute('DELETE FROM buckets WHERE minute<?',(int(now-RETENTION),))
            self.db.execute('DELETE FROM gaps WHERE end<?',(now-RETENTION,))
            self.db.execute('COMMIT');self.state='stale' if backlog else 'available';self.issues=['log_backlog'] if backlog else []
            return self.snapshot()
        except BaseException:self.db.execute('ROLLBACK');raise
    def consume(self,line,now):
        try:entry=json.loads(line)
        except (ValueError,UnicodeError):self.gap('log_record_invalid',now);return
        if not isinstance(entry,dict) or entry.get('stream')!='stdout' or not isinstance(entry.get('log'),str):return
        match=MARKER.fullmatch(entry['log'])
        if not match:return
        millis=int(match[1])*1000+int(match[2]);stamp=millis/1000
        if stamp<float(self.meta('started_at')):return
        if stamp>now+5:self.gap('log_clock_skew',now);return
        minute=millis//60000*60;kind=match[3]
        self.db.execute('''INSERT INTO buckets VALUES(?,?,?) ON CONFLICT(minute) DO UPDATE SET
            document=document+excluded.document,flight=flight+excluded.flight''',
            (minute,int(kind=='document'),int(kind=='flight')))
    def snapshot(self,*,state=None,issues=None):
        now=self.clock();started=float(self.meta('started_at',now));last=float(self.meta('last_complete',0))
        state=state or self.state;issues=list(self.issues if issues is None else issues)
        if state=='available' and not -5<=now-last<90:state='stale';issues.append('collector_heartbeat_stale')
        periods={}
        for name,(start,end) in period_windows(now).items():
            count=None;coverage='unavailable'
            if state=='available' and end>started:
                count=self.db.execute('SELECT COALESCE(SUM(document+flight),0) FROM buckets WHERE minute>=? AND minute<?',(start,end)).fetchone()[0]
                gap=self.db.execute('SELECT 1 FROM gaps WHERE start<? AND end>=? LIMIT 1',(end,start)).fetchone()
                coverage='partial' if start<started or gap else 'complete'
                if gap and 'collection_gap' not in issues:issues.append('collection_gap')
            periods[name]={'start':iso(start),'end':iso(end),'count':count,'coverage':coverage}
        return {'version':1,'observedAt':iso(now),'startedAt':iso(started),'timezone':'Europe/Paris','unit':'page_responses',
                'resolutionSeconds':60,'state':state,'periods':periods,'issues':issues}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container',default='photo-edge-1');parser.add_argument('--state-dir',type=Path,default=Path('/var/lib/maison-pages'))
    parser.add_argument('--interval',type=float,default=2);parser.add_argument('--once',action='store_true');args=parser.parse_args()
    if not 1<=args.interval<=30:raise CounterError('interval_invalid')
    os.umask(0o077);counter=Counter(args.state_dir)
    def stop(*_):raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop)
    try:
        while True:
            tick=time.monotonic()
            try:report=counter.poll(inspect_source(args.container))
            except (CounterError,OSError,ValueError,sqlite3.Error,subprocess.SubprocessError):
                report=counter.snapshot(state='unavailable',issues=['log_source_unavailable'])
            write_report(args.state_dir/'summary.json',report)
            if args.once:return 0
            time.sleep(max(.1,args.interval-(time.monotonic()-tick)))
    except KeyboardInterrupt:return 0
    finally:counter.close()

if __name__=='__main__':raise SystemExit(main())
