import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Route={GET:(request:Request)=>Promise<Response>};
const placements={header:true,footer:true,underVideo:true,feed:true,popunder:true,interstitial:true,slider:true};
const eligible={enabled:true,effectiveEnabled:true,reason:'eligible',consent:'accepted',profile:'intensive',revision:25,placements};
const spot={kind:'linear',tagUrl:'https://roll.example.com/own-fixture/vast',sourceHosts:['roll.example.com']};
function setup({cookie='v2%3Aaccepted',runtime={},missing=false}:{cookie?:string|null;runtime?:Record<string,unknown>;missing?:boolean}={}){
 const documents:Array<Record<string,unknown>>=[];
 const api=loadAppModule<Route>('src/app/api/ads/postroll/route.ts',{
  'next/headers':{cookies:async()=>({get:()=>cookie===null?undefined:{value:cookie}})},
  '@/lib/ads-runtime':{getAdsRuntime:async()=>({...eligible,...runtime})},
  '@/lib/trafficstars-roll-registry':{getTrafficStarsRollSpot:()=>missing?null:spot},
  '@/lib/exoclick-vast':{buildExoclickVastDocument:(options:Record<string,unknown>)=>{documents.push(options);return{html:'<!doctype html><title>Fixture postroll</title>',csp:"default-src 'none';frame-ancestors 'self'"};}},
 });
 return{...api,documents};
}
const query={nonce:'postroll_25_mobile',path:'/fr/example_creator/123',locale:'fr',device:'mobile'};
const request=(changes:Record<string,string>={},headers:Record<string,string>={'sec-fetch-site':'same-origin'})=>new Request(`https://leakfanhub.com/api/ads/postroll?${new URLSearchParams({...query,...changes})}`,{headers});

test('eligible postroll returns the own static tag and exact postroll context, privately, without requesting advertisements',async t=>{
 let external=0;t.mock.method(globalThis,'fetch',async()=>{external++;throw Error('no server fetching');});
 const api=setup(),response=await api.GET(request());assert.equal(response.status,200);assert.equal(external,0);
 assert.equal(api.documents.length,1);assert.equal(api.documents[0].mode,'postroll');assert.equal(api.documents[0].kind,'linear');
 assert.equal(api.documents[0].tagUrl,spot.tagUrl);assert.equal(api.documents[0].nonce,query.nonce);
 for(const[name,value]of Object.entries({'cache-control':'private, no-store','vary':'Cookie','x-frame-options':'SAMEORIGIN','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}))assert.equal(response.headers.get(name),value);
 assert.match(response.headers.get('x-robots-tag')??'',/noindex/);assert.equal(response.headers.get('set-cookie'),null);
});
test('postroll cannot bypass profile, placement, OFF, consent or entitlement exclusions',async()=>{
 for(const runtime of [{enabled:false},{effectiveEnabled:false},{reason:'owner'},{reason:'premium'},{reason:'unavailable'},{consent:'refused'},
  {profile:'current'},{profile:'balanced'},{profile:undefined},{placements:{...placements,underVideo:false}}]){
  const api=setup({runtime}),response=await api.GET(request());assert.equal(response.status,403,JSON.stringify(runtime));assert.equal(await response.text(),'');assert.equal(api.documents.length,0);
 }
 for(const cookie of [null,'v1:accepted','v2:refused'])assert.equal((await setup({cookie}).GET(request())).status,403);
});
test('postroll keeps the same strict origin, nonce, path and query schema as preroll',async()=>{
 const badQueries:Array<Record<string,string>>=[{zone:'5213624'},{provider:'trafficstars'},{mode:'preroll'},{subid:'visitor-input'},{nonce:'<bad>'},{device:'tablet'},{locale:'en-US'},{path:'/feed'},{path:'/fr/admin/ads'}];
 for(const changes of badQueries)assert.equal((await setup().GET(request(changes))).status,400);
 const badHeaders:Array<Record<string,string>>=[{},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-origin',origin:'https://evil.example.com'}];
 for(const headers of badHeaders)assert.equal((await setup().GET(request({},headers))).status,403);
 const duplicate=new URL(request().url);duplicate.searchParams.append('nonce','other');assert.equal((await setup().GET(new Request(duplicate,{headers:{'sec-fetch-site':'same-origin'}}))).status,400);
 assert.equal((await setup({missing:true}).GET(request())).status,503);
});


test('real registry reporting is fixed to phase and device, never the visitor nonce or path',async()=>{
 const docs:Array<Record<string,unknown>>=[];
 const route=loadAppModule<Route>('src/app/api/ads/postroll/route.ts',{
  'next/headers':{cookies:async()=>({get:()=>({value:'v2:accepted'})})},
  '@/lib/ads-runtime':{getAdsRuntime:async()=>eligible},
  '@/lib/exoclick-vast':{buildExoclickVastDocument:(options:Record<string,unknown>)=>{docs.push(options);return{html:'fixture',csp:"default-src 'none'"};}},
 });
 assert.equal((await route.GET(request())).status,200);
 assert.equal(docs[0].tagUrl,'https://fozekikikiminu.com/do2/dcefbcef2f5448d08fef0d7d710492be/vast?subid=lfh_intensive_postroll_mobile');
 assert.doesNotMatch(String(docs[0].tagUrl),/postroll_25_mobile|example_creator|123/);
});
