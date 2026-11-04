import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { validateCommand,readCommand,runAdsControl } from '../ops/ads-control.mjs';
test('operator accepts only fixed read/master commands and never arbitrary SQL, placements or actors',()=>{
  assert.deepEqual(validateCommand({action:'get'}),{action:'get'});
  assert.deepEqual(validateCommand({action:'set',enabled:false,revision:2}),{action:'set',enabled:false,revision:2});
  for(const value of [{action:'get',sql:'DROP'},{action:'set',enabled:'false',revision:0},{action:'set',enabled:false,revision:-1},{action:'set',enabled:false,revision:0,actor:'other'},{action:'set',enabled:false,revision:0,placements:{}}]) assert.equal(validateCommand(value),null);
});
test('stdin rejects malformed/oversized/invalid UTF-8 inputs with one sanitized error',async()=>{
  for(const bytes of [Buffer.from('{'),Buffer.alloc(2049,32),Buffer.from([255])]) await assert.rejects(readCommand(Readable.from([bytes])),/invalid_request/);
  assert.deepEqual(await readCommand(Readable.from(['{"action":"get"}'])),{action:'get'});
});
test('CLI invalid stdin never needs credentials and returns one JSON failure with exit 1',()=>{
  const run=spawnSync(process.execPath,['ops/ads-control.mjs'],{input:'{',encoding:'utf8',env:{PATH:process.env.PATH},timeout:6000});
  assert.equal(run.status,1);assert.equal(run.stderr,'');assert.deepEqual(JSON.parse(run.stdout),{ok:false,error:'invalid_request'});
});
test('operator storage failures are sanitized and invalid commands do not read storage',async()=>{
  let calls=0;const db={execute:async()=>{calls++;throw new Error('secret connection credentials');}};
  assert.deepEqual(await runAdsControl({action:'get',extra:true},db),{ok:false,error:'invalid_request'});assert.equal(calls,0);
  assert.deepEqual(await runAdsControl({action:'get'},db),{ok:false,error:'unavailable'});
});

test('Maison CLI outputs exactly its four legacy configuration fields while preserving the stored profile',async()=>{
  const placements={header:true,footer:true,underVideo:true,feed:true,popunder:true,interstitial:true,slider:true};
  let row={enabled:0,placements:JSON.stringify(placements),revision:2,updated_at:null,profile:'intensive'};
  const db={execute:async()=>[[{...row}]],getConnection:async()=>({beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},execute:async(sql,params)=>{
    if(sql.startsWith('SELECT'))return [[{...row}]];
    if(sql.startsWith('UPDATE')){row={...row,enabled:params.enabled,placements:params.placements,revision:row.revision+1,updated_at:params.now,profile:params.profile??row.profile};return [{affectedRows:1}];}
    if(sql.startsWith('INSERT'))return [{affectedRows:1}];
    throw new Error('unexpected SQL');
  }})};
  for(const command of [{action:'get'},{action:'set',enabled:true,revision:2}]){
    const result=await runAdsControl(command,db,'owner');assert.equal(result.ok,true);
    assert.deepEqual(Object.keys(result.config).sort(),['enabled','placements','revision','updatedAt']);
    assert.equal(Object.hasOwn(result.config,'profile'),false);assert.equal(row.profile,'intensive');
  }
  assert.equal(validateCommand({action:'set',enabled:false,revision:3,profile:'current'}),null);
});
