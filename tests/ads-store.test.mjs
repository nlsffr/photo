import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAdsSave, readAdsConfig, saveAdsConfig, setAdsMaster } from '../src/lib/ads-store-core.mjs';

const placements = {header:true,footer:true,underVideo:true,feed:true,popunder:true,interstitial:true,slider:true};
function database({failAudit=false,profile='current'}={}) {
  let row = {enabled:0,placements:JSON.stringify(placements),revision:0,updated_at:null,profile};
  let history = [], tail = Promise.resolve();
  return {
    get row() { return row; }, get history() { return history; },
    async execute() { return [[{...row}]]; },
    async getConnection() {
      let releaseLock, oldRow, oldHistory;
      return {
        async beginTransaction() {
          const previous = tail;
          tail = new Promise(resolve => { releaseLock=resolve; });
          await previous; oldRow={...row}; oldHistory=[...history];
        },
        async execute(sql, params) {
          if (sql.startsWith('SELECT')) return [[{...row}]];
          if (sql.startsWith('UPDATE')) {
            if (params.revision !== row.revision) return [{affectedRows:0}];
            row={enabled:params.enabled,placements:params.placements,revision:row.revision+1,updated_at:params.now,profile:params.profile??row.profile};
            return [{affectedRows:1}];
          }
          if (sql.startsWith('INSERT')) { if(failAudit)throw new Error('audit unavailable');history.push({...params}); return [{affectedRows:1}]; }
          throw new Error('unexpected SQL');
        },
        async commit() { releaseLock(); },
        async rollback() { row=oldRow; history=oldHistory; releaseLock(); },
        release() {},
      };
    },
  };
}

test('configuration is strict: booleans, exact placements, bounded revision and no script fields', () => {
  const good={revision:0,enabled:false,placements};
  assert.deepEqual(validateAdsSave(good),good);
  for (const bad of [{...good,enabled:'false'},{...good,revision:-1},{...good,revision:Number.MAX_SAFE_INTEGER},{...good,script:'alert(1)'},{...good,placements:{...placements,other:true}},{...good,placements:{...placements,feed:1}},{...good,placements:{feed:true}}]) {
    assert.equal(validateAdsSave(bad),null);
  }
});

test('profile transitions are validated, revisioned and recorded atomically',async()=>{
  const db=database();
  assert.equal((await readAdsConfig(db)).profile,'current');
  const balanced=await saveAdsConfig(db,{revision:0,enabled:false,placements,profile:'balanced'},'owner');
  assert.equal(balanced.ok,true);assert.equal(balanced.config.profile,'balanced');assert.equal(balanced.config.revision,1);
  assert.equal(db.row.profile,'balanced');assert.equal(db.history.length,1);
  assert.equal(db.history[0].previousProfile,'current');assert.equal(db.history[0].profile,'balanced');
  const intensive=await saveAdsConfig(db,{revision:1,enabled:false,placements,profile:'intensive'},'owner');
  assert.equal(intensive.ok,true);assert.equal(intensive.config.profile,'intensive');assert.equal(intensive.config.revision,2);
  assert.equal(db.history[1].previousProfile,'balanced');assert.equal(db.history[1].profile,'intensive');
  const broken=database({profile:'balanced',failAudit:true});
  assert.deepEqual(await saveAdsConfig(broken,{revision:0,enabled:false,placements,profile:'intensive'},'owner'),{ok:false,error:'unavailable'});
  assert.equal(broken.row.profile,'balanced');assert.equal(broken.row.revision,0);assert.equal(broken.history.length,0);
});

test('legacy saves and fixed master commands preserve the stored intensive profile',async()=>{
  const db=database({profile:'intensive'});
  const edited=await saveAdsConfig(db,{revision:0,enabled:false,placements:{...placements,feed:false}},'owner');
  assert.equal(edited.ok,true);assert.equal(edited.config.profile,'intensive');assert.equal(db.row.profile,'intensive');
  assert.equal(db.history[0].previousProfile,'intensive');assert.equal(db.history[0].profile,'intensive');
  const on=await setAdsMaster(db,{revision:1,enabled:true},'owner',()=>true);
  assert.equal(on.ok,true);assert.equal(on.config.profile,'intensive');assert.equal(db.row.profile,'intensive');
  assert.deepEqual(await setAdsMaster(db,{revision:2,enabled:false,profile:'current'},'owner'),{ok:false,error:'invalid_request'});
});

test('profile no-ops keep the revision and stale concurrent edits cannot replace the profile',async()=>{
  const db=database({profile:'intensive'});
  for(const payload of [{revision:0,enabled:false,placements},{revision:0,enabled:false,placements,profile:'intensive'}]){
    const result=await saveAdsConfig(db,payload,'owner');assert.equal(result.ok,true);assert.equal(result.config.revision,0);assert.equal(result.config.profile,'intensive');
  }
  assert.equal(db.history.length,0);
  const results=await Promise.all([
    saveAdsConfig(db,{revision:0,enabled:false,placements,profile:'balanced'},'owner'),
    saveAdsConfig(db,{revision:0,enabled:false,placements:{...placements,feed:false}},'owner'),
  ]);
  assert.equal(results.filter(value=>value.ok).length,1);assert.equal(results.filter(value=>value.error==='conflict').length,1);
  assert.equal(db.row.profile,'balanced');assert.equal(db.history.length,1);
});

test('unknown profiles are rejected before accessing storage and malformed stored profiles fail closed',async()=>{
  const base={revision:0,enabled:false,placements};let reads=0;
  for(const profile of [null,undefined,'unknown','Intensive','',0,{},['current']]){
    assert.equal(validateAdsSave({...base,profile}),null);
    assert.deepEqual(await saveAdsConfig({getConnection:async()=>{reads++;throw new Error('must not access storage');}},{...base,profile},'owner'),{ok:false,error:'invalid_request'});
  }
  assert.equal(reads,0);
  for(const profile of ['current','balanced','intensive'])assert.equal(validateAdsSave({...base,profile}).profile,profile);
  for(const profile of [null,'unknown','Intensive'])await assert.rejects(readAdsConfig({execute:async()=>[[{enabled:0,placements:JSON.stringify(placements),revision:0,updated_at:null,profile}]]}),/unavailable/);
});
test('initial OFF is readable; explicit ON followed by OFF uses shared CAS and audit', async () => {
  const db=database();
  assert.equal((await readAdsConfig(db)).enabled,false);
  const on=await saveAdsConfig(db,{revision:0,enabled:true,placements},'owner',()=>true);
  assert.equal(on.ok,true); assert.equal(on.config.enabled,true); assert.equal(on.config.revision,1);
  const off=await setAdsMaster(db,{revision:1,enabled:false},'owner',()=>true);
  assert.equal(off.ok,true); assert.equal(off.config.enabled,false);
  assert.deepEqual(off.config.placements,placements);
  assert.equal(db.history.length,2);
});
test('concurrent edits cannot overwrite one another, including CLI master changes', async () => {
  const db=database();
  const outcomes=await Promise.all([
    saveAdsConfig(db,{revision:0,enabled:false,placements:{...placements,feed:false}},'owner'),
    setAdsMaster(db,{revision:0,enabled:true},'owner'),
  ]);
  assert.equal(outcomes.filter(result=>result.ok).length,1);
  assert.equal(outcomes.filter(result=>result.error==='conflict').length,1);
  assert.equal(db.history.length,1);
});
test('unchanged edits do not manufacture revisions; missing or malformed storage is unavailable', async () => {
  const db=database();
  const result=await saveAdsConfig(db,{revision:0,enabled:false,placements},'owner',()=>true);
  assert.equal(result.config.revision,0); assert.equal(db.history.length,0);
  for (const row of [null,{enabled:1,placements:'{}',revision:0},{enabled:2,placements:JSON.stringify(placements),revision:0}]) {
    await assert.rejects(readAdsConfig({execute:async()=>[row?[row]:[]]}), /unavailable/);
  }
});
test('incomplete registry blocks ON without writes, and audit failure rolls the change back',async()=>{
  const blocked=database();
  assert.deepEqual(await saveAdsConfig(blocked,{revision:0,enabled:true,placements},'owner',()=>false),{ok:false,error:'not_ready'});
  assert.equal(blocked.row.enabled,0);assert.equal(blocked.history.length,0);
  const broken=database({failAudit:true});
  assert.deepEqual(await saveAdsConfig(broken,{revision:0,enabled:true,placements},'owner',()=>true),{ok:false,error:'unavailable'});
  assert.equal(broken.row.enabled,0);assert.equal(broken.row.revision,0);
});
