import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from './helpers/load-app-module.ts';

const USER = {id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',username:'owner',isCreator:false};
const OLD_HASH = 'scrypt$old$CaseSensitiveHash';
type LoginResult = {ok:true;user:typeof USER;[key:symbol]:string}|{ok:false;error:string};
type Auth = {VERIFIED_CREDENTIAL_HASH:symbol;verifyCredentials(id:string,password:string):Promise<LoginResult>;createSession(id:string,expectedHash?:string):Promise<string|null>};

function fixture() {
  let hash = OLD_HASH, failInsert = false;
  const sessions:string[] = [],events:string[]=[];
  const execute=async(sql:string,params:Record<string,unknown>)=>{
    if(sql.startsWith('SELECT id, email')) return [[{...USER,is_creator:0,password_hash:hash}]];
    if(sql.startsWith('SELECT password_hash')) {assert.match(sql,/FOR UPDATE/);events.push('locked-read');return [[{password_hash:hash}]];}
    if(sql.startsWith('INSERT INTO sessions')) {
      if(failInsert) throw new Error('private database details');
      events.push('insert');sessions.push(String(params.id));return [{affectedRows:1}];
    }
    throw new Error('unexpected query');
  };
  const db = {execute,getConnection:async()=>{
    const before=[...sessions];
    return {beginTransaction:async()=>{events.push('begin');},execute,
      commit:async()=>{events.push('commit');},rollback:async()=>{events.push('rollback');sessions.splice(0,sessions.length,...before);},
      release:()=>{events.push('release');}};
  }};
  const auth = loadAppModule<Auth>('src/lib/auth-db.ts',{
    'server-only':{},'./db-pool':{getDbPool:()=>db},
    './auth':{verifyPassword:async(password:string,stored:string)=>password==='old password'&&stored===OLD_HASH,
      newSessionToken:()=> 'a'.repeat(64),sessionExpiry:()=>new Date('2026-12-01T00:00:00Z')},
  });
  return {auth,sessions,events,reset(){hash='scrypt$new$DifferentHash';sessions.length=0;},caseChange(){hash=OLD_HASH.toLowerCase();},fail(){failInsert=true;}};
}

test('a verified old password cannot create a late session after reset/revocation',async()=>{
  const f=fixture(),verified=await f.auth.verifyCredentials(USER.email,'old password');assert.equal(verified.ok,true);
  f.reset();
  assert.equal(await f.auth.createSession(USER.id,OLD_HASH),null);
  assert.deepEqual(f.sessions,[]);
});

test('credential proof is outside public user and JSON; unchanged credentials create one session',async()=>{
  const f=fixture(),verified=await f.auth.verifyCredentials(USER.email,'old password');assert.equal(verified.ok,true);
  if(!verified.ok) throw Error('fixture');
  assert.equal(verified[f.auth.VERIFIED_CREDENTIAL_HASH],OLD_HASH);
  assert.deepEqual(verified.user,USER);assert.doesNotMatch(JSON.stringify(verified),/scrypt|CaseSensitiveHash/);
  assert.equal(await f.auth.createSession(USER.id,verified[f.auth.VERIFIED_CREDENTIAL_HASH]),'a'.repeat(64));
  assert.equal(f.sessions.length,1);
});

test('the proof comparison is case-sensitive; legacy createSession callers remain supported',async()=>{
  const f=fixture();f.caseChange();assert.equal(await f.auth.createSession(USER.id,OLD_HASH),null);
  assert.equal(await f.auth.createSession(USER.id),'a'.repeat(64));
});

test('credential session locks the user first and commits or rolls back before release',async()=>{
  const f=fixture();await f.auth.createSession(USER.id,OLD_HASH);
  assert.deepEqual(f.events,['begin','locked-read','insert','commit','release']);
  const broken=fixture();broken.fail();await assert.rejects(broken.auth.createSession(USER.id,OLD_HASH));
  assert.deepEqual(broken.events,['begin','locked-read','rollback','release']);assert.deepEqual(broken.sessions,[]);
});

function route(f:ReturnType<typeof fixture>,lateReset=false) {
  const cookies:{name:string;value:string}[]=[];
  const auth={...f.auth,createSession:async(id:string,proof?:string)=>{if(lateReset)f.reset();return f.auth.createSession(id,proof);}};
  const api=loadAppModule<{POST(request:Request):Promise<Response>}>('src/app/api/auth/login/route.ts',{
    '@/lib/auth-db':auth,'next/headers':{cookies:async()=>({set:(name:string,value:string)=>cookies.push({name,value})})},
    '@/lib/auth':{SESSION_COOKIE:'lumen_session',SESSION_TTL_DAYS:30},
    '@/lib/ratelimit':{sweep(){},rateLimitRequest:()=>({allowed:true})},
  });
  const request=()=>new Request('https://fixture.example/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:USER.email,password:'old password'})});
  return {api,cookies,request};
}

test('login never returns success/cookie when reset wins the proof race',async()=>{
  const f=fixture(),r=route(f,true),response=await r.api.POST(r.request());
  assert.equal(response.status,401);assert.equal((await response.json()).ok,false);assert.deepEqual(r.cookies,[]);assert.deepEqual(f.sessions,[]);
});

test('login storage failures are sanitized and normal login still succeeds',async()=>{
  const f=fixture(),r=route(f),response=await r.api.POST(r.request());
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.ok,true);assert.deepEqual(data.user,USER);assert.doesNotMatch(JSON.stringify(data),/scrypt|Hash/);assert.equal(r.cookies.length,1);
  const broken=fixture();broken.fail();const b=route(broken),failed=await b.api.POST(b.request());
  assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private database/);assert.deepEqual(b.cookies,[]);
});
