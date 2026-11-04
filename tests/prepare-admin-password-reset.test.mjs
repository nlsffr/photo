import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdtemp,chmod,readFile,stat,access,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareAdminPasswordReset} from '../ops/prepare-admin-password-reset.mjs';
const owner='00000000-0000-4000-8000-000000000001';
const oldHash=`scrypt$32768$8$1$${'c'.repeat(32)}$${'d'.repeat(64)}`;
const options={email:'owner@example.test',siteUrl:'https://fixture.example'};
function database(row={id:owner,password_hash:oldHash}) {
 return {calls:[],committed:0,rolledBack:0,started:0,
  async beginTransaction(){this.started++;},
  async execute(sql,params){this.calls.push({sql,params});return sql.startsWith('SELECT')?[row?[row]:[]]:[{affectedRows:1}];},
  async commit(){this.committed++;},async rollback(){this.rolledBack++;}};
}
async function fixture(run) {
 const directory=await mkdtemp(join(tmpdir(),'admin-reset-test-'));await chmod(directory,0o700);
 const before=process.env.SEO_EDITOR_USER_IDS;process.env.SEO_EDITOR_USER_IDS=owner;
 try{await run(join(directory,'reset.json'),directory);}finally{if(before===undefined)delete process.env.SEO_EDITOR_USER_IDS;else process.env.SEO_EDITOR_USER_IDS=before;await rm(directory,{recursive:true,force:true});}
}
test('preparation stores only token SHA256, keeps old credentials/sessions, and writes one private fragment URL for 30 minutes',async()=>{
 await fixture(async outputFile=>{
  const db=database(),start=Date.now();const result=await prepareAdminPasswordReset({...options,outputFile},db);
  const saved=JSON.parse(await readFile(outputFile,'utf8')),url=new URL(saved.resetURL),token=url.hash.slice(1);
  assert.equal(url.origin+url.pathname,'https://fixture.example/admin/password/reset');assert.equal(url.search,'');assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal((await stat(outputFile)).mode&0o777,0o600);assert.ok(Date.parse(saved.expiresAt)>=start+1800000);assert.ok(Date.parse(saved.expiresAt)<=Date.now()+1800000);
  const insert=db.calls.find(call=>call.sql.startsWith('INSERT INTO admin_password_resets'));
  assert.equal(insert.params.hash,createHash('sha256').update(token).digest('hex'));assert.equal(insert.params.id,owner);
  assert.equal(JSON.stringify(db.calls).includes(token),false);assert.equal(JSON.stringify(result).includes(token),false);
  assert.ok(db.calls.some(call=>/^UPDATE admin_password_resets/.test(call.sql)));
  assert.ok(db.calls.every(call=>!/^UPDATE users|^DELETE FROM sessions|^INSERT INTO sessions/.test(call.sql)));
  assert.equal(db.committed,1);assert.equal(db.rolledBack,0);
 });
});
test('only the existing password-owning account matching the unique configured owner can receive a reset',async()=>{
 for(const row of [null,{id:owner,password_hash:null},{id:owner,password_hash:'invalid'},{id:'other',password_hash:oldHash}]) await fixture(async outputFile=>{
  const db=database(row);await assert.rejects(prepareAdminPasswordReset({...options,outputFile},db));assert.equal(db.committed,0);assert.equal(db.rolledBack,1);
  await assert.rejects(access(outputFile));assert.equal(db.calls.length,1);
 });
 await fixture(async outputFile=>{
  for(const allowed of ['',owner+',other',owner+','+owner]) {
   process.env.SEO_EDITOR_USER_IDS=allowed;const db=database();await assert.rejects(prepareAdminPasswordReset({...options,outputFile},db));assert.equal(db.started,0);
  }
 });
});
test('existing output, public directories and failed inserts leave no credential changes',async()=>{
 await fixture(async(outputFile,directory)=>{
  await writeFile(outputFile,'keep',{mode:0o600});const db=database();await assert.rejects(prepareAdminPasswordReset({...options,outputFile},db));assert.equal(await readFile(outputFile,'utf8'),'keep');assert.equal(db.started,0);
  const other=join(directory,'other.json');await chmod(directory,0o755);await assert.rejects(prepareAdminPasswordReset({...options,outputFile:other},db));await chmod(directory,0o700);
  const original=db.execute.bind(db);db.execute=async(sql,params)=>{if(sql.startsWith('INSERT'))throw Error('secret driver failure');return original(sql,params);};
  await assert.rejects(prepareAdminPasswordReset({...options,outputFile:other},db));assert.equal(db.rolledBack,1);assert.equal(db.committed,0);await assert.rejects(access(other));
 });
});
test('CLI failures never echo identifiers, URLs, database credentials or output paths',()=>{
 const result=spawnSync(process.execPath,['ops/prepare-admin-password-reset.mjs','--email','private-argument','--output','/private-output.json'],{encoding:'utf8',env:{...process.env,NEXT_PUBLIC_SITE_URL:'https://fixture.example',DATABASE_URL:'mysql://private-user:private-password@invalid.example/catalog'}});
 assert.equal(result.status,1);assert.equal(result.stdout,'');assert.deepEqual(JSON.parse(result.stderr),{ok:false,error:'PREPARATION_FAILED'});
 assert.doesNotMatch(result.stderr,/private-argument|private-output|private-user|private-password/);
});
