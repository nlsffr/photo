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
