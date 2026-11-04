import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {resetAdminPassword,validPasswordResetInput} from '../src/lib/admin-password-reset.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import {hashPassword} from '../src/lib/auth.ts';

const token='a'.repeat(64),session='b'.repeat(64);
const hash=(letter:string)=>`scrypt$32768$8$1$${letter.repeat(32)}$${letter.repeat(64)}`;
const oldHash=hash('c'),newHash=hash('d');
const input={token,password:'chosen-password-example'};
function fixture(options:{found?:boolean;allowed?:boolean;active?:boolean;password?:string|null;changeDuringHash?:boolean;failInsert?:boolean;parallel?:boolean;expireDuringHash?:boolean;revokeDuringHash?:boolean;consumeFails?:boolean}={}) {
  const state={password:options.password===undefined?oldHash:options.password,used:false,sessions:['old-session-1','old-session-2'],hashed:0,committed:0,rolledBack:0,released:0};
  let tail=Promise.resolve(),releaseHash!:()=>void;
  const hashReady=new Promise<void>(resolve=>{releaseHash=resolve;});
  const eligible=()=>options.found!==false && options.active!==false && !state.used && state.password!==null;
  const database={
    execute:async()=>[eligible()?[{user_id:'owner',password_hash:state.password}]:[]],
    getConnection:async()=>{
      let unlock!:()=>void,previous!:{password:string|null;used:boolean;sessions:string[]};
      return {
        beginTransaction:async()=>{const before=tail;tail=new Promise<void>(resolve=>{unlock=resolve;});await before;previous={password:state.password,used:state.used,sessions:[...state.sessions]};},
        execute:async(sql:string,params:Record<string,string|Date>)=>{
          if(sql.startsWith('SELECT')&&sql.includes('FROM users'))return [[{id:'owner',password_hash:state.password}]];
          if(sql.startsWith('SELECT'))return [eligible()?[{user_id:'owner'}]:[]];
          if(sql.startsWith('UPDATE users')){if(state.password!==params.previousPassword)return [{affectedRows:0}];state.password=String(params.password);return [{affectedRows:1}];}
          if(sql.startsWith('UPDATE admin_password_resets')){if(!eligible()||options.consumeFails)return [{affectedRows:0}];state.used=true;return [{affectedRows:1}];}
          if(sql.startsWith('DELETE FROM sessions')){const count=state.sessions.length;state.sessions=[];return [{affectedRows:count}];}
          if(sql.startsWith('INSERT INTO sessions')){if(options.failInsert)throw new Error('private driver details');state.sessions.push(String(params.token));return [{affectedRows:1}];}
          throw new Error('unexpected SQL');
        },
        commit:async()=>{state.committed++;unlock();},
        rollback:async()=>{state.password=previous.password;state.used=previous.used;state.sessions=previous.sessions;state.rolledBack++;unlock();},
        release:()=>{state.released++;},
      };
    },
  };
  const dependencies={isAllowed:(id:string)=>options.allowed!==false&&id==='owner',
    hashPassword:async()=>{state.hashed++;if(options.expireDuringHash)options.active=false;if(options.revokeDuringHash)options.allowed=false;if(options.changeDuringHash)state.password=hash('e');if(options.parallel){if(state.hashed===2)releaseHash();await hashReady;}return newHash;},
    newSessionToken:()=>session,sessionExpiry:()=>new Date('2999-01-01T00:00:00Z')};
  return {database,dependencies,state};
}
test('reset input is exact and bounded; invalid tokens/passwords never cause a KDF',async()=>{
  assert.equal(validPasswordResetInput(input),true);
  for(const value of [{...input,token:'short'},{...input,password:'short'},{...input,password:'x'.repeat(201)},{...input,extra:true},{...input,password:null}]) {
    const f=fixture();assert.equal(validPasswordResetInput(value),false);
    assert.deepEqual(await resetAdminPassword(f.database,value,f.dependencies),{ok:false,error:'invalid'});assert.equal(f.state.hashed,0);
  }
});
test('unknown, expired, unauthorized and passwordless accounts never cause a KDF',async()=>{
  for(const options of [{found:false},{active:false},{allowed:false},{password:null},{password:'malformed-hash'}]) {
    const f=fixture(options);assert.deepEqual(await resetAdminPassword(f.database,input,f.dependencies),{ok:false,error:'invalid'});assert.equal(f.state.hashed,0);assert.equal(f.state.committed,0);
  }
});
test('a valid reset changes the hash, consumes the token and replaces every session atomically',async()=>{
  const f=fixture();assert.deepEqual(await resetAdminPassword(f.database,input,f.dependencies),{ok:true,token:session});
  assert.equal(f.state.password,newHash);assert.equal(f.state.used,true);assert.deepEqual(f.state.sessions,[session]);assert.equal(f.state.committed,1);assert.equal(f.state.released,1);
  assert.deepEqual(await resetAdminPassword(f.database,input,f.dependencies),{ok:false,error:'invalid'});assert.equal(f.state.hashed,1);
});
test('password changes during KDF invalidate the stale reset without reverting that newer password',async()=>{
  const f=fixture({changeDuringHash:true});assert.deepEqual(await resetAdminPassword(f.database,input,f.dependencies),{ok:false,error:'invalid'});
  assert.equal(f.state.password,hash('e'));assert.equal(f.state.used,false);assert.deepEqual(f.state.sessions,['old-session-1','old-session-2']);
});
test('two concurrent submissions produce one new session and one consumed token',async()=>{
  const f=fixture({parallel:true});const results=await Promise.all([resetAdminPassword(f.database,input,f.dependencies),resetAdminPassword(f.database,input,f.dependencies)]);
  assert.equal(results.filter(value=>value.ok).length,1);assert.equal(f.state.committed,1);assert.equal(f.state.rolledBack,1);assert.deepEqual(f.state.sessions,[session]);
});
test('failed session creation rolls back the new password, token consumption and session revocation',async()=>{
  const f=fixture({failInsert:true});assert.deepEqual(await resetAdminPassword(f.database,input,f.dependencies),{ok:false,error:'unavailable'});
  assert.equal(f.state.password,oldHash);assert.equal(f.state.used,false);assert.deepEqual(f.state.sessions,['old-session-1','old-session-2']);assert.equal(f.state.rolledBack,1);assert.equal(f.state.released,1);
});
test('the reset accepts real hashes produced by the application before and after scrypt',async()=>{
  const existing=await hashPassword('fixture-old-password-example');
  const f=fixture({password:existing});f.dependencies.hashPassword=()=>hashPassword(input.password);
  const result=await resetAdminPassword(f.database,input,f.dependencies);
  assert.equal(result.ok,true);assert.match(f.state.password??'',/^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.notEqual(f.state.password,existing);assert.equal(f.state.used,true);
});
test('expiry or revoked ownership during KDF and failed consumption preserve old credentials',async()=>{
  for(const options of [{expireDuringHash:true},{revokeDuringHash:true},{consumeFails:true}]){
    const f=fixture(options);assert.deepEqual(await resetAdminPassword(f.database,input,f.dependencies),{ok:false,error:'invalid'});
    assert.equal(f.state.password,oldHash);assert.equal(f.state.used,false);assert.deepEqual(f.state.sessions,['old-session-1','old-session-2']);assert.equal(f.state.rolledBack,1);
  }
});
