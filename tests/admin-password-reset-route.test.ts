import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import {validPasswordResetInput} from '../src/lib/admin-password-reset.ts';
const input={token:'a'.repeat(64),password:'fixture-selected-password'};
function fixture(options:{rate?:boolean;db?:boolean;error?:string}={}) {
  const calls:unknown[]=[],cookies:unknown[]=[],limits:unknown[]=[];
  const access=loadAppModule<Record<string,unknown>>('src/lib/seo-editor-access.ts',{'server-only':{},'next/headers':{},'./auth-db':{}});
  const owner=loadAppModule<Record<string,unknown>>('src/lib/ads-access.ts',{'server-only':{},'./seo-editor-access':{}});
  const route=loadAppModule<{POST(request:Request):Promise<Response>}>('src/app/api/admin/password/reset/route.ts',{
    'next/headers':{cookies:async()=>({set:(...args:unknown[])=>cookies.push(args)})},
    '@/lib/auth':{SESSION_COOKIE:'lumen_session',SESSION_TTL_DAYS:30,hashPassword:()=>{},newSessionToken:()=>{},sessionExpiry:()=>{}},
    '@/lib/ads-access':owner,'@/lib/seo-editor-access':access,'@/lib/db-pool':{getDbPool:()=>options.db===false?null:{}},
    '@/lib/ratelimit':{sweep:()=>{},rateLimitRequest:(_request:Request,value:unknown)=>{limits.push(value);return {allowed:options.rate!==false};}},
    '@/lib/admin-password-reset':{validPasswordResetInput,resetAdminPassword:async(_db:unknown,value:unknown,deps:{isAllowed(id:string):boolean})=>{
      calls.push(value);return !deps.isAllowed('owner')?{ok:false,error:'invalid'}:options.error?{ok:false,error:options.error}:{ok:true,token:'b'.repeat(64)};
    }},
  });
  return {...route,calls,cookies,limits};
}
const request=(value:unknown=input,origin='https://fixture.example')=>new Request('https://fixture.example/api/admin/password/reset',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)});
async function environment(run:()=>Promise<void>){
  const site=process.env.NEXT_PUBLIC_SITE_URL,owners=process.env.SEO_EDITOR_USER_IDS,mode=process.env.NODE_ENV;
  process.env.NEXT_PUBLIC_SITE_URL='https://fixture.example';process.env.SEO_EDITOR_USER_IDS='owner';(process.env as Record<string,string|undefined>).NODE_ENV='production';
  try{await run();}finally{for(const [key,value] of [['NEXT_PUBLIC_SITE_URL',site],['SEO_EDITOR_USER_IDS',owners],['NODE_ENV',mode]] as const){if(value===undefined)delete process.env[key];else (process.env as Record<string,string|undefined>)[key]=value;}}
}
test('reset API requires canonical Origin, bounded JSON and the dedicated anti-abuse budget',()=>environment(async()=>{
  const f=fixture();assert.equal((await f.POST(request(input,'https://foreign.example'))).status,403);
  assert.equal((await f.POST(new Request('https://fixture.example/api/admin/password/reset',{method:'POST',body:'{}'}))).status,403);
  assert.equal((await f.POST(request({...input,password:'x'.repeat(17000)}))).status,413);
  assert.equal((await f.POST(request({...input,extra:true}))).status,400);assert.equal(f.calls.length,0);
  const blocked=fixture({rate:false});assert.equal((await blocked.POST(request())).status,429);assert.equal(blocked.calls.length,0);
  assert.deepEqual(blocked.limits,[{scope:'admin-password-reset',limit:5,peerLimit:100,windowMs:600000}]);
}));
test('success sets one protected session cookie and never returns a credential',()=>environment(async()=>{
  const f=fixture(),response=await f.POST(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  assert.equal(f.cookies.length,1);const [name,value,settings]=f.cookies[0] as [string,string,Record<string,unknown>];
  assert.equal(name,'lumen_session');assert.equal(value,'b'.repeat(64));assert.deepEqual(settings,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:2592000});
  assert.match(response.headers.get('cache-control')??'',/private.*no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.match(response.headers.get('x-robots-tag')??'',/noindex/);
}));
test('stale/expired/used tokens, DB failures and widened owner allowlists never set a session',()=>environment(async()=>{
  for(const [options,status] of [[{error:'invalid'},410],[{error:'unavailable'},503],[{db:false},503]] as const){const f=fixture(options);assert.equal((await f.POST(request())).status,status);assert.equal(f.cookies.length,0);}
  process.env.SEO_EDITOR_USER_IDS='owner,other';const f=fixture();assert.equal((await f.POST(request())).status,410);assert.equal(f.cookies.length,0);
}));
