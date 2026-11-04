import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
function fixture({enabled=true,effectiveEnabled=true,placement=true,broken=false,profile='current'}={}) {
  let documents=0,reads=0;
  const route=loadAppModule<{GET(request:Request):Promise<Response>}>('src/app/api/ads/embed/route.ts',{
    '@/lib/ads-runtime':{getAdsRuntime:async()=>{reads++;return {enabled,effectiveEnabled,profile,placements:{header:placement,footer:placement,underVideo:placement,feed:placement}};}},
    '@/lib/ads-embed-document':{buildAdsEmbedDocument:(selected:string,device:string)=>{documents++;if(broken)throw new Error('missing');return {html:`<!doctype html><title>${selected}-${device}</title>`,csp:"default-src 'none'; frame-ancestors 'self'"};}},
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
    ['intensive','placement=feed&device=desktop&ordinal=0',403],
    ['current','placement=feed&device=mobile',200],
  ] as const){const api=fixture({profile});assert.equal((await api.GET(request(query))).status,status);assert.equal(api.documents(),status===200?1:0);}
  for(const query of ['placement=header&device=mobile&ordinal=0','placement=feed&device=mobile&ordinal=-1','placement=feed&device=mobile&ordinal=01','placement=feed&device=mobile&ordinal=1000001']){
    assert.equal((await fixture().GET(request(query))).status,400);
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
