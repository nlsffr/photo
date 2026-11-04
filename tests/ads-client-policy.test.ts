import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import { canServeAds, isAdPagePath, isFeedAdPosition, parseAdsRuntime, parseBrowserAdConsent } from '../src/lib/ads-client-policy.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import { emptyAdPlacements } from '../src/lib/ads-contract.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import { LOCALES } from '../src/lib/i18n/config.ts';
const runtime = { enabled: true, effectiveEnabled: true, revision: 1, needsConsent: false, consent: 'accepted', placements: {...emptyAdPlacements(), header: true}, reason: 'eligible' } as const;

test('advertising is closed until every current eligibility check succeeds', () => {
  for (const changes of [{runtime:null}, {runtime:{...runtime,enabled:false}}, {runtime:{...runtime,effectiveEnabled:false}}, {runtime:{...runtime,reason:'owner'}}, {ageConfirmed:false}, {consent:null}, {consent:'refused'}, {sessionLoading:true}, {premiumReady:false}, {isPremium:true}, {pathname:'/admin/ads'}, {fresh:false}] as const) {
    assert.equal(canServeAds({runtime,ageConfirmed:true,consent:'accepted',sessionLoading:false,premiumReady:true,isPremium:false,pathname:'/',fresh:true,...changes}),false);
  }
  assert.equal(canServeAds({runtime,ageConfirmed:true,consent:'accepted',sessionLoading:false,premiumReady:true,isPremium:false,pathname:'/fr/models',fresh:true}),true);
});
test('malformed or partial runtime never enables any placement', () => {
  for (const value of [null,{}, {...runtime, placements:{}}, {...runtime,enabled:'true'}, {...runtime,revision:-1},{...runtime,profile:'unknown'},{...runtime,profile:null}]) assert.equal(parseAdsRuntime(value),null);
  assert.deepEqual(parseAdsRuntime(runtime),runtime);
  for(const profile of ['current','balanced','intensive'])assert.equal(parseAdsRuntime({...runtime,profile})?.profile,profile);
});
test('functional and private routes cannot load advertising even under language prefixes', () => {
  for (const prefix of ['',...LOCALES.map(locale=>'/'+locale)]) assert.equal(isAdPagePath(prefix+'/identite'),false);
  for (const p of ['/admin/ads','/fr/premium','/connexion','/api/ads/runtime','/confidentialite','/contact/support','/dmca','/inscription','/add','/mentions-legales']) assert.equal(isAdPagePath(p),false,p);
  for (const p of ['/','/fr/models','/feed','/creator/123','/creator/videos']) assert.equal(isAdPagePath(p),true,p);
});
test('feed slots use media ordinals without replacing media or appending an empty final slot', () => {
  assert.deepEqual(Array.from({length:19},(_,i)=>i).filter(i=>isFeedAdPosition(i,19)),[4,8,12,16]);
  assert.equal(isFeedAdPosition(4,5),false);
});
test('browser consent accepts Next encoded cookies and rejects legacy or malformed values',()=>{
  assert.equal(parseBrowserAdConsent('other=1; lfh_ad_consent=v2%3Aaccepted'),'accepted');
  assert.equal(parseBrowserAdConsent('lfh_ad_consent=v1:refused'),'refused');
  for(const value of ['lfh_ad_consent=v1:accepted','lfh_ad_consent=v1%3Aaccepted','lfh_audience=accepted','lfh_ad_consent=accepted','lfh_ad_consent=v1%253Aaccepted','lfh_ad_consent=%E0%A4%A']) assert.equal(parseBrowserAdConsent(value),null);
});
