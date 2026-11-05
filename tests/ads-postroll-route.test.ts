import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Route={GET:(request:Request)=>Promise<Response>};
function setup(){
 let cookieReads=0,runtimeReads=0,registryReads=0,adBuilds=0;
 const route=loadAppModule<Route>('src/app/api/ads/postroll/route.ts',{
  'next/headers':{cookies:async()=>{cookieReads++;throw Error('retired route must not read cookies');}},
  '@/lib/ads-runtime':{getAdsRuntime:async()=>{runtimeReads++;throw Error('retired route must not read runtime');}},
  '@/lib/trafficstars-roll-registry':{getTrafficStarsRollSpot:()=>{registryReads++;throw Error('retired route must not select a zone');}},
  '@/lib/exoclick-vast':{buildExoclickVastDocument:()=>{adBuilds++;throw Error('retired route must not build an advertisement');}},
 });return{...route,counts:()=>({cookieReads,runtimeReads,registryReads,adBuilds})};
}
const query={nonce:'postroll_25_mobile',path:'/fr/example_creator/123',locale:'fr',device:'mobile'};
const request=(changes:Record<string,string>={},headers:Record<string,string>={'sec-fetch-site':'same-origin'},origin='https://leakfanhub.com')=>new Request(`${origin}/api/ads/postroll?${new URLSearchParams({...query,...changes})}`,{headers});

test('retired postroll immediately returns only its nonce-correlated neutral completion without cookies, runtime or vendor work',async t=>{
 let external=0;t.mock.method(globalThis,'fetch',async()=>{external++;throw Error('no remote fetching');});
 const api=setup(),response=await api.GET(request());assert.equal(response.status,200);assert.equal(external,0);
 assert.deepEqual(api.counts(),{cookieReads:0,runtimeReads:0,registryReads:0,adBuilds:0});
 const html=await response.text();assert.match(html,/lfh-ad-status/);assert.match(html,/postroll/);assert.match(html,/empty/);assert.match(html,/postroll_25_mobile/);
 assert.doesNotMatch(html,/magsrv|fozekikikiminu|tsyndicate|<iframe|<video|<img|fetch\(|setTimeout|setInterval|\.cookie/);
 for(const[name,value]of Object.entries({'cache-control':'private, no-store','vary':'Cookie','x-frame-options':'SAMEORIGIN','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}))assert.equal(response.headers.get(name),value);
 assert.match(response.headers.get('x-robots-tag')??'',/noindex/);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('x-lfh-ad-retired'),'postroll');
 assert.match(response.headers.get('content-security-policy')??'',/script-src 'sha256-/);
 assert.doesNotMatch(response.headers.get('content-security-policy')??'',/unsafe-inline|unsafe-eval/);
});

test('retired compatibility keeps strict nonce, same-origin, path, locale and unique query validation',async()=>{
 const badQueries:Array<Record<string,string>>=[{zone:'5213624'},{provider:'trafficstars'},{mode:'preroll'},{subid:'visitor-input'},{nonce:'<bad>'},{device:'tablet'},{locale:'en-US'},{path:'/feed'},{path:'/fr/admin/ads'}];
 for(const changes of badQueries)assert.equal((await setup().GET(request(changes))).status,400,JSON.stringify(changes));
 const badHeaders:Array<Record<string,string>>=[{},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-origin',origin:'https://evil.example.com'}];
 for(const headers of badHeaders)assert.equal((await setup().GET(request({},headers))).status,403);
 const duplicate=new URL(request().url);duplicate.searchParams.append('nonce','other');assert.equal((await setup().GET(new Request(duplicate,{headers:{'sec-fetch-site':'same-origin'}}))).status,400);
 for(const locale of ['en','fr','es','de','it','pt','nl','ru','zh','ja','hi','th'])assert.equal((await setup().GET(request({locale}))).status,200,locale);
 for(const origin of ['http://localhost:3028','http://127.0.0.1:3028'])assert.equal((await setup().GET(request({}, {'sec-fetch-site':'same-origin',origin},origin))).status,200);
});
