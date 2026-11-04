import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Route={GET:(request:Request)=>Promise<Response>};
const placements={header:true,footer:true,underVideo:true,feed:true,popunder:true,interstitial:true,slider:true};
const eligible={enabled:true,effectiveEnabled:true,reason:'eligible',consent:'accepted',profile:'intensive',revision:25,placements};
const fixtureSpot={kind:'linear',zoneId:900001,tagUrl:'https://roll.example.com/own-fixture/vast',sourceHosts:['roll.example.com']};
function setup({cookie='v2%3Aaccepted',runtime={},broken=false,missing=false}:{cookie?:string|null;runtime?:Record<string,unknown>;broken?:boolean;missing?:boolean}={}){
 let reads=0;const documents:Array<Record<string,unknown>>=[];
 const route=loadAppModule<Route>('src/app/api/ads/preroll/route.ts',{
  'next/headers':{cookies:async()=>({get:(key:string)=>key==='lfh_ad_consent'&&cookie!==null?{value:cookie}:undefined})},
  '@/lib/ads-runtime':{getAdsRuntime:async()=>{reads++;if(broken)throw Error('private backend detail');return{...eligible,...runtime};}},
  '@/lib/trafficstars-roll-registry':{getTrafficStarsRollSpot:()=>missing?null:fixtureSpot},
  '@/lib/exoclick-vast':{buildExoclickVastDocument:(options:Record<string,unknown>)=>{documents.push(options);return{html:'<!doctype html><title>Fixture preroll</title>',csp:"default-src 'none';frame-ancestors 'self'"};}},
 });return{...route,reads:()=>reads,documents};
}
const defaults={nonce:'preroll_25_mobile',path:'/fr/example_creator/123',locale:'fr',device:'mobile'};
function request(changes:Record<string,string|null>={},headers:Record<string,string|null>={},origin='https://leakfanhub.com'){
 const query=new URLSearchParams(defaults);for(const[key,value]of Object.entries(changes)){if(value===null)query.delete(key);else query.set(key,value);}
 const selected:Record<string,string>={'sec-fetch-site':'same-origin'};for(const[key,value]of Object.entries(headers)){if(value===null)delete selected[key];else selected[key]=value;}
 return new Request(`${origin}/api/ads/preroll?${query}`,{headers:selected});
}

test('an eligible intensive media path returns only the registered preroll document without fetching any VAST or creative',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;throw Error('server must not fetch advertisements');});
 const api=setup(),response=await api.GET(request());assert.equal(response.status,200);assert.equal(api.reads(),1);assert.equal(requests,0);
 assert.equal(api.documents.length,1);const options=api.documents[0];
 assert.equal(options.mode,'preroll');assert.equal(options.kind,'linear');assert.equal(options.placement,'underVideo');assert.equal(options.tagUrl,fixtureSpot.tagUrl);
 assert.deepEqual(options.sourceHosts,fixtureSpot.sourceHosts);assert.equal(options.nonce,defaults.nonce);assert.equal(options.parentOrigin,'https://leakfanhub.com');assert.equal(options.consentValue,'v2:accepted');
 assert.match(response.headers.get('cache-control')??'',/private, no-store/);assert.equal(response.headers.get('vary'),'Cookie');
 assert.match(response.headers.get('x-robots-tag')??'',/noindex/);assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.match(response.headers.get('content-security-policy')??'',/frame-ancestors 'self'/);assert.equal(response.headers.get('set-cookie'),null);
});

test('all runtime and underVideo gates stay closed, including every other saved profile',async()=>{
 for(const runtime of [{enabled:false},{effectiveEnabled:false},{reason:'owner'},{reason:'premium'},{reason:'unavailable'},{consent:null},{consent:'refused'},
  {profile:'current'},{profile:'balanced'},{profile:undefined},{profile:null},{placements:{...placements,underVideo:false}}]){
  const api=setup({runtime}),response=await api.GET(request());assert.equal(response.status,403,JSON.stringify(runtime));assert.equal(await response.text(),'');assert.equal(api.documents.length,0);
 }
});

test('only the current explicit v2 advertising acceptance can reach runtime or a document',async()=>{
 for(const cookie of [null,'v1:accepted','v1:refused','v2:refused','broken','v3:accepted','%bad']){
  const api=setup({cookie});assert.equal((await api.GET(request())).status,403,String(cookie));assert.equal(api.reads(),0);assert.equal(api.documents.length,0);
 }
 assert.equal((await setup({cookie:'v2:accepted'}).GET(request())).status,200);
});

test('query keys are exact and unique; client input cannot supply a zone, provider, profile or format',async()=>{
 const cases:Array<Record<string,string|null>>=[{nonce:null},{path:null},{device:null},{locale:null},{zoneId:'6074810'},{tagUrl:'https://attacker.test/vast'},
  {placement:'feed'},{context:'page'},{profile:'intensive'},{mediation:'alternative'},{nonce:''},{nonce:'x'.repeat(101)},{nonce:'bad<script>'},
  {locale:'fr-FR'},{device:'tablet'},{device:'Mobile'}];
 for(const changes of cases){
  const api=setup();assert.equal((await api.GET(request(changes))).status,400,JSON.stringify(changes));assert.equal(api.reads(),0);
 }
 for(const key of Object.keys(defaults)){
  const url=new URL(request().url);url.searchParams.append(key,defaults[key as keyof typeof defaults]);const api=setup();
  assert.equal((await api.GET(new Request(url,{headers:{'sec-fetch-site':'same-origin'}}))).status,400);assert.equal(api.reads(),0);
 }
});

test('a canonical public media context is mandatory, with no page-type claim or private-path bypass',async()=>{
 for(const path of ['/','/models','/feed','/example_creator','/example_creator/photos','/tag/portrait','/admin/ads','/fr/admin/ads','/api/readyz','/premium',
  '//attacker.test/a','/fr/zh/example_creator/123','/example_creator%2Fbad/123','/example_creator/../premium','/example_creator/123?x=1','/example_creator/123#part']){
  const api=setup();assert.equal((await api.GET(request({path}))).status,400,path);assert.equal(api.reads(),0);
 }
 for(const path of ['/example_creator/123','/ru/example_creator-v2/123-v3','/zh/example_creator/videos-v2'])assert.equal((await setup().GET(request({path}))).status,200,path);
});

test('only same-origin fetch metadata passes; missing or foreign fetch sites are denied before runtime',async()=>{
 for(const value of [null,'none','same-site','cross-site','unknown','Same-Origin']){
  const api=setup();assert.equal((await api.GET(request({}, {'sec-fetch-site':value}))).status,403,String(value));assert.equal(api.reads(),0);
 }
 assert.equal((await setup().GET(request({}, {origin:'https://leakfanhub.com'}))).status,200);
 for(const origin of ['null','https://attacker.test','https://www.leakfanhub.com','http://leakfanhub.com'])assert.equal((await setup().GET(request({}, {origin}))).status,403,origin);
});

test('public Host fixes an internal Next origin while exact local QA origins keep the same source/origin rules',async()=>{
 const api=setup();assert.equal((await api.GET(request({}, {host:'leakfanhub.com'},'http://localhost:3000'))).status,200);
 assert.equal(api.documents[0].parentOrigin,'https://leakfanhub.com');
 for(const origin of ['http://localhost:3028','http://127.0.0.1:3028'])assert.equal((await setup().GET(request({}, {origin},origin))).status,200);
 const local=setup();assert.equal((await local.GET(request({}, {host:'127.0.0.1:3029',origin:'http://127.0.0.1:3029'},'http://localhost:3029'))).status,200);
 assert.equal(local.documents[0].parentOrigin,'http://127.0.0.1:3029');
 for(const host of ['attacker.test','leakfanhub.com.attacker.test','user@leakfanhub.com','leakfanhub.com/path','leakfanhub.com:444'])assert.equal((await setup().GET(request({}, {host}))).status,403,host);
 for(const origin of ['https://attacker.test','http://leakfanhub.com','https://leakfanhub.com:444'])assert.equal((await setup().GET(request({}, {},origin))).status,403,origin);
});

test('all twelve locales have translated labels with no unsafe or missing locale fallback',async()=>{
 for(const locale of ['en','fr','es','de','it','pt','nl','ru','zh','ja','hi','th']){
  const api=setup();assert.equal((await api.GET(request({locale}))).status,200,locale);
  const labels=api.documents[0].labels as Record<string,string>;for(const name of ['advertisement','close','skip','visit','play'])assert.ok(labels[name]?.length,name);
 }
});

test('missing static registry or unavailable backend fails without leaking credentials, details or an ad document',async()=>{
 for(const options of [{missing:true},{broken:true}]){
  const api=setup(options),response=await api.GET(request());assert.equal(response.status,503);assert.equal(await response.text(),'');assert.equal(api.documents.length,0);
 }
});
