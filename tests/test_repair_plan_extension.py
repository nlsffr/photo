import importlib.util,json
from pathlib import Path
import tempfile,unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('plan_extension',ROOT/'ops/extend-media-repair-plan.py')
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
class ExtensionTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  self.old={'version':1,'rows':[{'id':'a','file_size':0}],'review':[{'id':'b','reason':'invalid_poster_key'}]}
  self.new={'version':1,'rows':[{'id':'a','file_size':99},{'id':'b'}],'review':[]}
  self.plan=self.root/'plan.json';self.supplement=self.root/'supplement.json';e.shared.atomic_json(self.plan,self.old);e.shared.atomic_json(self.supplement,self.new)
  _,self.digest=e.shared.read_private_json(self.plan);self.state_dir=self.root/'state'
  state=e.shared.State(self.state_dir,self.old['rows'],self.digest);state.next_job(100);state.finish('a','done',{'status':'restored'},0,150);state.close()
 def state(self):
  plan,digest=e.shared.read_private_json(self.plan);return e.shared.State(self.state_dir,plan['rows'],digest)
 def test_extension_keeps_expected_rows_and_completed_results(self):
  r=e.extend(self.plan,self.supplement,self.state_dir);self.assertEqual(r['added'],1)
  p,_=e.shared.read_private_json(self.plan);self.assertEqual(p['rows'][0],self.old['rows'][0]);self.assertEqual(p['review'],[])
  s=self.state();self.assertEqual((s.summary()['done'],s.summary()['pending']),(1,1));self.assertEqual(s.get_meta('global_not_before'),'150');s.close()
  r=e.extend(self.plan,self.supplement,self.state_dir);self.assertEqual(r['added'],0)
 def test_active_coordinator_blocks_extension(self):
  with e.shared.file_lock(self.state_dir/'driver.lock'):
   with self.assertRaisesRegex(e.shared.BackfillError,'already_running'):e.extend(self.plan,self.supplement,self.state_dir)
 def test_inconsistent_checkpoint_refuses_before_mutation(self):
  import sqlite3
  db=sqlite3.connect(self.state_dir/'checkpoint.sqlite3');db.execute("UPDATE jobs SET expected=? WHERE id='a'",(json.dumps({'id':'a','changed':True}),));db.commit();db.close()
  with self.assertRaisesRegex(e.shared.BackfillError,'checkpoint_rows_differ'):e.extend(self.plan,self.supplement,self.state_dir)
  self.assertEqual(e.shared.read_private_json(self.plan)[1],self.digest)
 def test_failed_plan_write_leaves_original_checkpoint_usable(self):
  with patch.object(e,'write_plan',side_effect=OSError('fail')):
   with self.assertRaises(OSError):e.extend(self.plan,self.supplement,self.state_dir)
  self.assertEqual(e.shared.read_private_json(self.plan)[1],self.digest);s=self.state();self.assertEqual(s.summary()['done'],1);s.close()
 def test_crash_after_plan_replace_rolls_back_from_journal(self):
  import multiprocessing,os
  def crash():
   original=e.atomic_bytes
   def replace(path,content):
    original(path,content)
    if Path(path)==self.plan:os._exit(9)
   e.atomic_bytes=replace;e.extend(self.plan,self.supplement,self.state_dir)
  process=multiprocessing.get_context('fork').Process(target=crash);process.start();process.join(5)
  self.assertEqual(process.exitcode,9);self.assertNotEqual(e.shared.read_private_json(self.plan)[1],self.digest)
  self.assertEqual(e.recover(self.plan,self.state_dir),['rolled_back'])
  self.assertEqual(e.shared.read_private_json(self.plan)[1],self.digest);s=self.state();self.assertEqual(s.summary()['done'],1);s.close()
 def test_committed_extension_recovery_rolls_forward_exact_bytes(self):
  import sqlite3
  e.extend(self.plan,self.supplement,self.state_dir)
  migration=next((self.state_dir/'extensions').glob('*/migration.json'))
  data,_=e.shared.read_private_json(migration);data['phase']='prepared';e.shared.atomic_json(migration,data)
  self.plan.write_bytes((migration.parent/'plan.before.json').read_bytes())
  self.assertEqual(e.recover(self.plan,self.state_dir),['complete'])
  s=self.state();self.assertEqual((s.summary()['done'],s.summary()['pending']),(1,1));s.close()
if __name__=='__main__':unittest.main()
