import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
function fixture({enabled=true,effectiveEnabled=true,placement=true,broken=false,profile='current'}={}) {
  let documents=0,reads=0;
  const route=loadAppModule<{GET(request:Request):Promise<Response>}>('src/app/api/ads/embed/route.ts',{
    '@/lib/ads-runtime':{getAdsRuntime:async()=>{reads++;return {enabled,effectiveEnabled,profile,placements:{header:placement,footer:placement,underVideo:placement,feed:placement}};}},
    '@/lib/ads-embed-document':{buildAdsEmbedDocument:(selected:string,device:string,_profile:unknown,page?:{kind:string})=>{documents++;if(broken)throw new Error('missing');return {html:`<!doctype html><title>${selected}-${device}-${page?.kind??'legacy'}</title>`,csp:"default-src 'none'; frame-ancestors 'self'"};}},
  });
  return {...route,documents:()=>documents,reads:()=>reads};
}
const request=(query='placement=header&device=mobile')=>new Request('https://fixture.example/api/ads/embed?'+query);
test('master OFF, unknown/ineligible or disabled placements produce no advertising document',async()=>{
  for(const options of [{enabled:false},{effectiveEnabled:false},{placement:false}]) {
    const route=fixture(options),response=await route.GET(request());
    assert.equal(response.status,403);assert.equal(route.documents(),0);assert.doesNotMatch(await response.text(),/script|iframe|https:/i);
  }
});
test('TrafficStars documents cannot bypass the provider selected for the current slot',async()=>{
  for(const [profile,query,status] of [
    ['current','placement=footer&device=mobile',403],
    ['balanced','placement=underVideo&device=desktop',403],
    ['balanced','placement=feed&device=mobile&ordinal=1',403],
    ['balanced','placement=feed&device=mobile&ordinal=0',200],
    ['balanced','placement=feed&device=mobile',400],
    ['intensive','placement=feed&device=desktop&ordinal=0&path=%2Ffeed',200],
    ['current','placement=feed&device=mobile',200],
  ] as const){const api=fixture({profile});assert.equal((await api.GET(request(query))).status,status);assert.equal(api.documents(),status===200?1:0);}
  for(const query of ['placement=header&device=mobile&ordinal=0','placement=feed&device=mobile&ordinal=-1','placement=feed&device=mobile&ordinal=01','placement=feed&device=mobile&ordinal=1000001']){
    assert.equal((await fixture().GET(request(query))).status,400);
  }
});
test('the TS endpoint accepts only the intensive standard branch and never an arbitrary mediation value',async()=>{
  const base='placement=feed&device=mobile&ordinal=0&path=%2Ffeed';
  assert.equal((await fixture({profile:'intensive'}).GET(request(base+'&mediation=standard'))).status,200);
  assert.equal((await fixture({profile:'intensive'}).GET(request(base+'&mediation=alternative'))).status,403);
  for(const suffix of ['&mediation=unknown','&mediation=null','&mediation=standard&mediation=alternative']){
    const route=fixture({profile:'intensive'});assert.equal((await route.GET(request(base+suffix))).status,400);assert.equal(route.reads(),0);
  }
  for(const profile of ['current','balanced'])assert.equal((await fixture({profile}).GET(request(base+'&mediation=standard'))).status,400);
  for(const placement of ['interstitial','slider','popunder']){
    const route=fixture({profile:'intensive'});assert.equal((await route.GET(request('placement='+placement+'&device=mobile&path=%2Fmodels&mediation=alternative'))).status,400);assert.equal(route.reads(),0);
  }
});
test('iframe route rejects missing, duplicate and arbitrary query parameters before reading runtime',async()=>{
  for(const query of ['', 'placement=header','placement=popunder&device=mobile','placement=header&device=phone','placement=header&device=mobile&script=evil','placement=header&placement=footer&device=mobile']) {
    const route=fixture();assert.equal((await route.GET(request(query))).status,400);assert.equal(route.reads(),0);assert.equal(route.documents(),0);
  }
});
test('eligible document is private, unindexable and restricted to same-origin framing',async()=>{
  const route=fixture(),response=await route.GET(request());assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control')??'',/private.*no-store/);assert.equal(response.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.match(response.headers.get('content-security-policy')??'',/frame-ancestors 'self'/);assert.match(response.headers.get('x-robots-tag')??'',/noindex/);
  assert.match(await response.text(),/header-mobile/);assert.equal(route.documents(),1);
  assert.equal((await fixture({broken:true}).GET(request())).status,503);
});
test('intensive requires a canonical public page path and derives its format context on the server',async()=>{
  const route=fixture({profile:'intensive'});
  assert.equal((await route.GET(request())).status,400);
  const response=await route.GET(request('placement=header&device=mobile&path=%2Fzh%2Fsample-v23%2Fphotos'));
  assert.equal(response.status,200);assert.match(await response.text(),/header-mobile-creator/);
  for(const query of ['placement=header&device=mobile&path=%2Ffr%2Fidentite',
    'placement=header&device=mobile&path=%2Fsample&path=%2Fmodels',
    'placement=header&device=mobile&path=%2Fsample&variant=creator',
    'placement=header&device=mobile&path=%2Ffeed',
    'placement=feed&device=mobile&ordinal=0&path=%2Fmodels'])assert.equal((await route.GET(request(query))).status,400,query);
  for(const profile of ['current','balanced'])assert.equal((await fixture({profile}).GET(request())).status,200);
});
