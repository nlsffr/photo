#!/usr/bin/env python3
"""Append validated candidates without losing expected identities or checkpoints.

Run only while the repair service is stopped. driver.lock also excludes orphaned
publishers. A private plan+SQLite backup is retained before the atomic transition.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import sqlite3
import time
import tempfile

spec=importlib.util.spec_from_file_location('_repair_extension_shared',Path(__file__).with_name('backfill-missing-video-assets.py'))
shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)


def write_plan(path,plan):shared.atomic_json(path,plan)


def atomic_bytes(path, content):
    path=Path(path);fd,tmp=tempfile.mkstemp(prefix='.repair-plan-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(content);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
        directory=os.open(path.parent,os.O_RDONLY|getattr(os,'O_DIRECTORY',0))
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)


def recover_locked(plan_path,root,db):
    """The committed SQLite digest decides rollback/rollforward after a crash."""
    recorded=db.execute("SELECT value FROM meta WHERE key='plan_sha256'").fetchone()
    if recorded is None:raise shared.BackfillError('checkpoint_plan_missing')
    recovered=[]
    for marker in sorted((root/'extensions').glob('*/migration.json')):
        migration,_=shared.read_private_json(marker)
        if migration.get('phase')!='prepared':continue
        old,new=migration['from_sha256'],migration['to_sha256']
        if recorded[0] not in (old,new):raise shared.BackfillError('migration_digest_unresolved')
        source=marker.parent/('plan.before.json' if recorded[0]==old else 'plan.after.json')
        shared.read_private_json(source);content=source.read_bytes()
        if hashlib.sha256(content).hexdigest()!=recorded[0]:raise shared.BackfillError('migration_backup_differs')
        atomic_bytes(plan_path,content)
        phase='rolled_back' if recorded[0]==old else 'complete'
        shared.atomic_json(marker,{**migration,'phase':phase});recovered.append(phase)
    return recovered


def recover(plan_path,state_dir):
    root=shared.private_directory(state_dir)
    with shared.file_lock(root/'driver.lock'):
        db=sqlite3.connect(root/'checkpoint.sqlite3',isolation_level=None)
        try:return recover_locked(Path(plan_path),root,db)
        finally:db.close()


def extend(plan_path,supplement_path,state_dir):
    root=shared.private_directory(state_dir);plan_path=Path(plan_path)
    with shared.file_lock(root/'driver.lock'):
        recovery_db=sqlite3.connect(root/'checkpoint.sqlite3',isolation_level=None)
        try:recover_locked(plan_path,root,recovery_db)
        finally:recovery_db.close()
        old,digest=shared.read_private_json(plan_path);supplement,_=shared.read_private_json(supplement_path)
        rows=shared.validate_plan(old);fresh=shared.validate_plan(supplement)
        if old.get('kind')!=supplement.get('kind'):raise shared.BackfillError('plan_kind_differs')
        ids={r['id'] for r in rows};added=[r for r in fresh if r['id'] not in ids]
        db=sqlite3.connect(root/'checkpoint.sqlite3',isolation_level=None)
        changed=False;backup=None
        try:
            recorded=db.execute("SELECT value FROM meta WHERE key='plan_sha256'").fetchone()
            if recorded is None or recorded[0]!=digest:raise shared.BackfillError('checkpoint_plan_differs')
            actual=[json.loads(r[0]) for r in db.execute('SELECT expected FROM jobs ORDER BY position')]
            if actual!=rows:raise shared.BackfillError('checkpoint_rows_differ')
            if not added:return {'added':0,'total':len(rows),'checkpoint_preserved':True}
            merged_rows=rows+added;planned={r['id'] for r in merged_rows}
            review={r['id']:r for r in old.get('review',[])+supplement.get('review',[]) if r['id'] not in planned}
            merged={**old,'rows':merged_rows,'review':list(review.values()),'extended_at':time.time(),'previous_sha256':digest,
                    'summary':{'planned_rows':len(merged_rows),'review_rows':len(review),'added_rows':len(added)}}
            backup=shared.private_directory(root/'extensions'/str(time.time_ns()))
            # Persist the directory entries that hold both recovery snapshots.
            for directory in (backup.parent,root):
                fd=os.open(directory,os.O_RDONLY|getattr(os,'O_DIRECTORY',0))
                try:os.fsync(fd)
                finally:os.close(fd)
            atomic_bytes(backup/'plan.before.json',plan_path.read_bytes())
            copy=sqlite3.connect(backup/'checkpoint.before.sqlite3');os.chmod(backup/'checkpoint.before.sqlite3',0o600)
            try:db.backup(copy)
            finally:copy.close()
            staged=backup/'plan.after.json';write_plan(staged,merged);_,next_digest=shared.read_private_json(staged)
            shared.atomic_json(backup/'migration.json',{'from_sha256':digest,'to_sha256':next_digest,'phase':'prepared'})
            db.execute('BEGIN IMMEDIATE')
            try:
                for index,row in enumerate(added,len(rows)):
                    db.execute('INSERT INTO jobs(id,expected,position) VALUES(?,?,?)',(row['id'],json.dumps(row,sort_keys=True),index))
                db.execute("UPDATE meta SET value=? WHERE key='plan_sha256'",(next_digest,))
                atomic_bytes(plan_path,staged.read_bytes());changed=True
                db.execute('COMMIT')
            except BaseException:
                db.execute('ROLLBACK')
                if changed:atomic_bytes(plan_path,(backup/'plan.before.json').read_bytes())
                raise
            shared.atomic_json(backup/'migration.json',{'from_sha256':digest,'to_sha256':next_digest,'phase':'complete'})
            return {'added':len(added),'total':len(merged_rows),'checkpoint_preserved':True,'backup':str(backup)}
        finally:db.close()


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--plan',type=Path,required=True)
    p.add_argument('--supplement',type=Path);p.add_argument('--state-dir',type=Path,required=True);p.add_argument('--recover',action='store_true')
    args=p.parse_args()
    if args.recover:print(json.dumps({'recovered':recover(args.plan,args.state_dir)}))
    else:
        if args.supplement is None:p.error('--supplement is required for extension')
        print(json.dumps(extend(args.plan,args.supplement,args.state_dir)))

if __name__=='__main__':
    def stop(*_):raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop);main()
