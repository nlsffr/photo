#!/usr/bin/env python3
"""Root controller: four saved MegaBot identities, never arbitrary client commands."""
if __package__ in (None, ''):
    import sys
    from pathlib import Path
    # Keep the sibling queue.py out of the standard-library import search path.
    sys.path[0] = str(Path(__file__).resolve().parents[2])

import datetime as dt
import fcntl
import grp
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import socketserver
import stat
import subprocess
import sys
import threading
import time
from ops.megabot_queue import health

CONFIG=Path('/etc/maison-commandes/bots.json')
SOCKET=Path('/run/maison-commandes/control.sock')
AUDIT=Path('/var/lib/maison-commandes/actions.jsonl')
QUEUE_CONFIG=Path('/etc/megabot-queue/config.json')
QUEUE_CURRENT=Path('/opt/megabot-queue/current')
IDS=frozenset('mega-'+str(n) for n in range(1,5))
UNITS={'ingest-bridge.service':'Bridge ingestion','leakfanhub-notification-worker.service':'Notifications',
 'leakfanhub-telegram-premium.service':'Telegram Premium','dmca-listener.service':'Écoute DMCA',
 'dmca-reimport.service':'Réimport DMCA','dmca-publisher.service':'Publication DMCA',
 'dmca-listener.timer':'Planification écoute DMCA','dmca-reimport.timer':'Planification réimport DMCA',
 'dmca-publisher.timer':'Planification publication DMCA','leakfanhub-media-tombstones.service':'Contrôle des retraits'}

def now():return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z')
class ControlError(RuntimeError):
    def __init__(self,code,status=409):self.code=code;self.status=status;super().__init__(code)

def private_file(path):
    st=path.lstat()
    if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_mode&0o077:raise ControlError('unsafe_configuration',503)
    return path.read_bytes()

def load_config():
    return validate_config(json.loads(private_file(CONFIG)))

def validate_config(value):
    if not isinstance(value,dict) or set(value)!={'version','bots'} or value['version']!=1 or not isinstance(value['bots'],list):raise ControlError('invalid_configuration',503)
    if not all(isinstance(b,dict) for b in value['bots']):raise ControlError('invalid_configuration',503)
    if {b.get('id') for b in value['bots']}!=IDS or len(value['bots'])!=4:raise ControlError('invalid_configuration',503)
    for b in value['bots']:
        n=b['id'][-1]
        if (b.get('cwd')!='/opt/megabot' or b.get('script')!='/opt/megabot/megabot.py'
          or b.get('exe')!='/usr/bin/python3.12' or b.get('log')!='/opt/megabot/bot'+n+'.log'
          or not isinstance(b.get('argv'),list) or not 2<=len(b['argv'])<=5
          or not all(isinstance(a,str) and '\x00' not in a for a in b['argv'])
          or b['argv'][-1] not in ('megabot.py','/opt/megabot/megabot.py')
          or any(a not in ('-u','-B') for a in b['argv'][1:-1])
          or not isinstance(b.get('env'),dict) or b['env'].get('BOT_ID')!=n
          or not all(isinstance(k,str) and isinstance(v,str) and '\x00' not in k+v and '=' not in k for k,v in b['env'].items())
          or b.get('uid')!=0 or b.get('gid')!=0 or type(b.get('umask')) is not int or not 0<=b['umask']<=0o777
          or not re.fullmatch(r'[0-9a-f]{64}',b.get('sha256',''))):raise ControlError('invalid_configuration',503)
        for key in ('START_INDEX','END_INDEX'):
            if not re.fullmatch(r'[0-9]{1,7}',b['env'].get(key,'')):raise ControlError('invalid_configuration',503)
        if int(b['env']['START_INDEX'])>=int(b['env']['END_INDEX']):raise ControlError('invalid_configuration',503)
    return value

def managed_queue(proc=Path('/proc')):
    # Installation markers fail closed even if the helper or service is broken.
    if not os.path.lexists(QUEUE_CONFIG) and not os.path.lexists(QUEUE_CURRENT):return None
    try:
        QUEUE_CURRENT.resolve(strict=True)
        from ops.megabot_queue import dashboard
        if Path(dashboard.__file__).resolve()!=Path(__file__).resolve().with_name('dashboard.py'):raise ValueError('wrong_helper')
        return dashboard.Dashboard(proc=proc)
    except Exception:raise ControlError('managed_queue_unavailable',409) from None

class Controller:
    def __init__(self,config,*,proc=Path('/proc'),audit=AUDIT):
        self.entries={b['id']:b for b in config['bots']};self.proc=proc;self.audit=audit;self.lock=threading.Lock();self.children=[]
        self.pipeline_health=health.PipelineHealth(queue_reader=lambda:managed_queue(self.proc),proc=self.proc)
    def process(self,p):
        try:
            fields=(p/'stat').read_text().rsplit(')',1)[1].split()
            if fields[0]=='Z':return None
            status=dict(x.split(':',1) for x in (p/'status').read_text().splitlines() if ':' in x)
            return {'pid':int(p.name),'ticks':fields[19],'uid':int(status['Uid'].split()[1]),'gid':int(status['Gid'].split()[1]),'umask':int(status['Umask'].strip(),8), 'exe':os.readlink(p/'exe'),'cwd':os.readlink(p/'cwd'),
              'argv':[x.decode() for x in (p/'cmdline').read_bytes().split(b'\0') if x],
              'env':dict(x.decode().split('=',1) for x in (p/'environ').read_bytes().split(b'\0') if b'=' in x)}
        except (OSError,ValueError,UnicodeError,IndexError,KeyError):return None
    def find(self,b):
        matches=[];conflicts=[]
        for p in self.proc.iterdir():
            if not p.name.isdigit():continue
            row=self.process(p)
            if not row or row['env'].get('BOT_ID')!=b['env']['BOT_ID']:continue
            if not any(Path(a).name=='megabot.py' for a in row['argv']):continue
            exact=all(row[k]==b[k] for k in ('exe','cwd','argv','env','uid','gid','umask'))
            (matches if exact else conflicts).append(row)
        return matches,conflicts
    def summary(self,b):
        counts={'success':0,'errors':0,'skipped':0};progress=None;last=None;activity='unknown';completed=False
        try:
            p=Path(b['log']);st=p.stat();last=dt.datetime.fromtimestamp(st.st_mtime,dt.timezone.utc).isoformat()
            with p.open('rb') as stream:
                stream.seek(max(0,st.st_size-512*1024));lines=stream.read(512*1024).decode(errors='replace').splitlines()[-300:]
            counts={'success':sum('OK [' in x for x in lines),'errors':sum(any(k in x for k in ('Download fail','Upload/DB fail','ERROR','Traceback')) for x in lines),'skipped':sum('skip duplicate' in x for x in lines)}
            for x in lines:
                match=re.search(r'Terminé BOT'+b['env']['BOT_ID']+r' new=(\d+) skip=(\d+) err=(\d+)',x)
                if match:progress=dict(zip(('new','skip','err'),map(int,match.groups())));completed=True
                elif x.strip():progress=None;completed=False
            age=time.time()-st.st_mtime
            last_success=max((i for i,x in enumerate(lines) if 'OK [' in x),default=-1)
            last_error=max((i for i,x in enumerate(lines) if any(k in x for k in ('Download fail','Upload/DB fail','ERROR','Traceback'))),default=-1)
            activity='completed' if completed else 'unknown' if age>300 else 'errors' if last_error>last_success else 'productive' if last_success>=0 else 'idle'
        except OSError:pass
        return counts,progress,last,activity,completed
    def item(self,b):
        try:
            managed=managed_queue(self.proc)
            if managed is not None:return managed.item(b['id'],b['name'],lambda:self._legacy_item(b))
        except Exception:
            return {'id':b['id'],'name':b['name'],'kind':'process','state':'error','activity':'unknown',
              'pid':None,'range':None,'lastLogAt':None,'recent':{'success':None,'errors':None,'skipped':None},
              'progress':None,'actions':[],'managedQueue':True,'error':'managed_queue_unavailable'}
        return self._legacy_item(b)
    def _legacy_item(self,b):
        matches,conflicts=self.find(b);counts,progress,last,activity,completed=self.summary(b)
        state='error' if conflicts or len(matches)>1 else 'running' if matches else 'completed' if completed else 'stopped'
        return {'id':b['id'],'name':b['name'],'kind':'process','state':state,'activity':activity if matches or completed else 'unknown',
          'pid':matches[0]['pid'] if len(matches)==1 and not conflicts else None,
          'range':{'start':int(b['env']['START_INDEX']),'end':int(b['env']['END_INDEX'])},'lastLogAt':last,
          'recent':counts,'progress':progress,'actions':[] if state=='error' else ['stop'] if matches else ['start']}
    def status(self):
        self.children=[p for p in self.children if p.poll() is None]
        result={'ok':True,'observedAt':now(),'bots':[self.item(b) for b in self.entries.values()],'services':service_status()}
        try:result['pipelineHealth']=self.pipeline_health.snapshot()
        except Exception:result['pipelineHealth']=None
        return result
    def record(self,bot,action,result):
        self.audit.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        flags=os.O_WRONLY|os.O_CREAT|os.O_APPEND|os.O_NOFOLLOW
        fd=os.open(self.audit,flags,0o600)
        try:os.write(fd,(json.dumps({'at':now(),'bot':bot,'action':action,'result':result})+'\n').encode())
        finally:os.close(fd)
    def action(self,bot,action):
        if not isinstance(bot,str) or not isinstance(action,str) or bot not in self.entries or bot not in IDS or action not in ('start','stop'):raise ControlError('invalid_command',400)
        self.record(bot,action,'requested')
        try:reply=self._perform(bot,action)
        except ControlError as error:
            self.record(bot,action,error.code);raise
        try:self.record(bot,action,reply['result'])
        except OSError:reply['auditWarning']=True
        return reply
    def _perform(self,bot,action):
        with self.lock:
            b=self.entries[bot];managed=managed_queue(self.proc);matches,conflicts=self.find(b)
            if conflicts or len(matches)>1:raise ControlError('identity_conflict')
            if managed is not None:
                try:managed.set_enabled(bot,action=='start')
                except Exception:raise ControlError('managed_queue_unavailable',409) from None
                if action=='start' or not matches:
                    result='already_running' if action=='start' and matches else 'enabled' if action=='start' else 'stop_requested'
                    return {'ok':True,'bot':bot,'action':action,'result':result,'botState':self.item(b)}
            if action=='start':
                if matches:result='already_running'
                else:
                    if hashlib.sha256(Path(b['script']).read_bytes()).hexdigest()!=b['sha256']:raise ControlError('source_changed')
                    # Append only: existing logs and media are never deleted or truncated.
                    fd=os.open(b['log'],os.O_WRONLY|os.O_CREAT|os.O_APPEND|os.O_NOFOLLOW,0o600)
                    try:
                        child=subprocess.Popen(b['argv'],executable=b['exe'],cwd=b['cwd'],env=b['env'],user=b['uid'],group=b['gid'],extra_groups=[],umask=b['umask'],stdin=subprocess.DEVNULL,stdout=fd,stderr=fd,start_new_session=True)
                    finally:os.close(fd)
                    self.children.append(child)
                    for _ in range(20):
                        live,other=self.find(b)
                        if len(live)==1 and live[0]['pid']==child.pid and not other:break
                        if len(live)>1 or other:raise ControlError('identity_conflict')
                        if child.poll() is not None:raise ControlError('start_failed')
                        time.sleep(.05)
                    else:raise ControlError('start_unconfirmed')
                    result='started'
            elif not matches:result='already_stopped'
            else:
                row=matches[0]
                if not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):raise ControlError('safe_stop_unavailable',503)
                fd=os.pidfd_open(row['pid'])
                try:
                    current=self.process(self.proc/str(row['pid']))
                    if current!=row:raise ControlError('process_changed')
                    signal.pidfd_send_signal(fd,signal.SIGTERM)
                    for _ in range(50):
                        current=self.process(self.proc/str(row['pid']))
                        if not current or current['ticks']!=row['ticks']:break
                        time.sleep(.1)
                    else:raise ControlError('stop_pending')
                finally:os.close(fd)
                result='stopped'
            return {'ok':True,'bot':bot,'action':action,'result':result,'botState':self.item(b)}

def service_status():
    try:
        raw=subprocess.run(['systemctl','show','--no-pager','--property=Id,ActiveState,SubState,MainPID,UnitFileState',*UNITS],capture_output=True,text=True,timeout=3).stdout
    except (OSError,subprocess.SubprocessError):return []
    result=[]
    for block in raw.strip().split('\n\n'):
        row=dict(x.split('=',1) for x in block.splitlines() if '=' in x);unit=row.get('Id')
        if unit not in UNITS:continue
        state=row.get('ActiveState','unknown');sub=row.get('SubState')
        if sub=='auto-restart' or state=='failed':state='error'
        elif unit.endswith('.timer') and state=='inactive' and row.get('UnitFileState')=='disabled':state='disabled'
        result.append({'id':unit,'name':UNITS[unit],'kind':'timer' if unit.endswith('.timer') else 'service','state':state,'activity':'errors' if state=='error' else 'unknown','actions':[]})
    return result

class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(12)
        try:
            raw=self.rfile.readline(513)
            if len(raw)>512 or not raw.endswith(b'\n'):raise ControlError('invalid_request',400)
            request=json.loads(raw)
            if request=={'op':'status'}:reply=self.server.controller.status()
            elif isinstance(request,dict) and set(request)=={'op','bot','action'} and request['op']=='action':reply=self.server.controller.action(request['bot'],request['action'])
            else:raise ControlError('invalid_request',400)
        except ControlError as e:reply={'ok':False,'error':e.code,'status':e.status}
        except (OSError,ValueError,TypeError,KeyError):reply={'ok':False,'error':'controller_unavailable','status':503}
        try:self.wfile.write(json.dumps(reply,ensure_ascii=False).encode()+b'\n')
        except OSError:pass

class Server(socketserver.ThreadingUnixStreamServer):
    daemon_threads=True

def main():
    if os.geteuid()!=0:raise ControlError('root_required',503)
    config=load_config();SOCKET.parent.mkdir(mode=0o750,parents=True,exist_ok=True)
    # A single controller owns the lock for its entire lifetime.
    with (SOCKET.parent/'controller.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if SOCKET.exists():
            if not stat.S_ISSOCK(SOCKET.lstat().st_mode) or SOCKET.lstat().st_uid!=0:raise ControlError('unsafe_socket',503)
            SOCKET.unlink()
        with Server(str(SOCKET),Handler) as server:
            os.chown(SOCKET,0,grp.getgrnam('maisonwifi').gr_gid);SOCKET.chmod(0o660)
            server.controller=Controller(config);server.serve_forever()

if __name__=='__main__':
    os.umask(0o077)
    try:main()
    except (OSError,ValueError,KeyError,ControlError):sys.exit('maison-commandes: startup_failed')
