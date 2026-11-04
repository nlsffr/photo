import assert from 'node:assert/strict';
import test from 'node:test';
import type {AdProfile,AdsConfig,AdsRuntime,AdPlacements} from '../src/lib/ads-contract';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

const flags:AdPlacements={header:true,footer:true,underVideo:true,feed:true,popunder:true,interstitial:true,slider:true};
const config:AdsConfig={enabled:true,revision:20,updatedAt:null,placements:flags};
const {evaluateAdsRuntime}=loadAppModule<{evaluateAdsRuntime:(config:AdsConfig,consent:string|null,viewer:string)=>AdsRuntime}>('src/lib/ads-runtime-policy.ts');
const {selectAdProvider}=loadAppModule<{selectAdProvider:(input:{profile?:AdProfile;placement:string;device:string;context?:string;ordinal?:number})=>string|null}>('src/lib/ads-provider-plan.ts');
const expected:Record<AdProfile,readonly string[]>={current:['header','footer','underVideo'],balanced:['header','footer','underVideo','feed','popunder','slider'],intensive:Object.keys(flags)};
const enabled=(placements:AdPlacements)=>Object.keys(placements).filter(key=>placements[key as keyof AdPlacements]);

test('the three saved levels impose their real allowed formats without changing stored switches',()=>{
 for(const profile of ['current','balanced','intensive'] as const){
  const saved={...config,profile,placements:{...flags}},before=JSON.stringify(saved),runtime=evaluateAdsRuntime(saved,'accepted','guest');
  assert.deepEqual(enabled(runtime.placements),expected[profile]);assert.equal(runtime.effectiveEnabled,true);assert.equal(JSON.stringify(saved),before);
 }
 assert.deepEqual(enabled(evaluateAdsRuntime(config,'accepted','member').placements),expected.current);
});

test('only disallowed saved flags cannot leave a level effectively enabled',()=>{
 const noBanners={header:false,footer:false,underVideo:false,feed:true,popunder:true,interstitial:true,slider:true};
 const current=evaluateAdsRuntime({...config,profile:'current',placements:noBanners},'accepted','guest');
 assert.equal(current.effectiveEnabled,false);assert.equal(current.reason,'disabled');assert.deepEqual(enabled(current.placements),[]);
 const onlyInterstitial={header:false,footer:false,underVideo:false,feed:false,popunder:false,interstitial:true,slider:false};
 const balanced=evaluateAdsRuntime({...config,profile:'balanced',placements:onlyInterstitial},'accepted','guest');
 assert.equal(balanced.effectiveEnabled,false);assert.equal(balanced.reason,'disabled');assert.deepEqual(enabled(balanced.placements),[]);
 assert.equal(evaluateAdsRuntime({...config,profile:'intensive',placements:onlyInterstitial},'accepted','guest').placements.interstitial,true);
});

test('the policy intersects rather than enables saved banner switches and keeps every exclusion',()=>{
 const saved={...config,placements:{...flags,footer:false}};
 assert.equal(evaluateAdsRuntime(saved,'accepted','guest').placements.footer,false);
 for(const profile of ['current','balanced','intensive'] as const){
  for(const viewer of ['owner','premium','unknown'])assert.deepEqual(enabled(evaluateAdsRuntime({...config,profile},'accepted',viewer).placements),[]);
  for(const consent of [null,'refused'])assert.deepEqual(enabled(evaluateAdsRuntime({...config,profile},consent,'guest').placements),[]);
  assert.deepEqual(enabled(evaluateAdsRuntime({...config,enabled:false,profile},'accepted','guest').placements),[]);
 }
});

test('provider selection independently refuses forbidden formats even with an unmasked runtime',()=>{
 for(const profile of [undefined,'current','balanced','intensive'] as const)for(const device of ['mobile','desktop']){
  const level=profile??'current';
  for(const placement of Object.keys(flags)){
   const result=selectAdProvider({profile,placement,device,...(placement==='feed'?{ordinal:0}:{})});
   assert.equal(result!==null,(expected[level] as readonly string[]).includes(placement),`${level}/${device}/${placement}`);
  }
  assert.equal(selectAdProvider({profile,placement:'underVideo',device,context:'pause'})!==null,level==='intensive');
 }
});

test('registry readiness sees only the effective formats and never requires forbidden SDK spots',async()=>{
 for(const profile of [undefined,'current','balanced','intensive'] as const){
  let checked:unknown;
  const {getAdsRuntime}=loadAppModule<{getAdsRuntime:()=>Promise<AdsRuntime>}>('src/lib/ads-runtime.ts',{
   'server-only':{},'next/headers':{cookies:async()=>({get:(key:string)=>key==='lfh_ad_consent'?{value:'v2:accepted'}:undefined})},
   './ads-store':{getAdsConfig:async()=>({...config,...(profile?{profile}:{})})},
   './ads-registry-data.mjs':{isAdsRegistryReady:(placements:AdPlacements)=>{checked=placements;return true;}},
  });
  await getAdsRuntime();assert.deepEqual(enabled(checked as AdPlacements),expected[profile??'current']);
 }
});
