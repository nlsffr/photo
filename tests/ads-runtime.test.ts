import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from './helpers/load-app-module.ts';
import type { AdsConfig, AdConsent } from '../src/lib/ads-contract';
const {evaluateAdsRuntime} = loadAppModule<{evaluateAdsRuntime(config:AdsConfig,consent:AdConsent,viewer:string):{effectiveEnabled:boolean;needsConsent:boolean;reason:string;placements:Record<string,boolean>}}>('src/lib/ads-runtime-policy.ts');
const config:AdsConfig={revision:2,enabled:true,updatedAt:null,placements:{header:true,footer:true,underVideo:true,feed:true,popunder:true,interstitial:true,slider:true}};
test('OFF always disables all placements, even with accepted consent and known non-Premium visitor',()=>{
  const value=evaluateAdsRuntime({...config,enabled:false},'accepted','member');
  assert.equal(value.effectiveEnabled,false);assert.equal(value.reason,'disabled');
  assert.ok(Object.values(value.placements).every(v=>!v));
});
test('only explicit ad consent permits eligible guests or members, never owners/Premium/unknown',()=>{
  for(const viewer of ['guest','member']) assert.equal(evaluateAdsRuntime(config,'accepted',viewer).effectiveEnabled,true);
  for(const viewer of ['owner','premium','unknown']) {
    const result=evaluateAdsRuntime(config,'accepted',viewer);
    assert.equal(result.effectiveEnabled,false); assert.ok(Object.values(result.placements).every(v=>!v));
  }
  assert.equal(evaluateAdsRuntime(config,null,'guest').needsConsent,true);
  assert.equal(evaluateAdsRuntime(config,'refused','guest').reason,'consent_refused');
});
function runtime(options:{cookies?:Record<string,string>;row?:Record<string,unknown>|null;dbError?:boolean;user?:{id:string}|null;owner?:boolean;settingsError?:boolean;enabled?:boolean}={}) {
  let reads=0;
  const loadedRuntime=loadAppModule<{getAdsRuntime():Promise<{effectiveEnabled:boolean;consent:string|null;reason:string}>;getAdsViewer(token?:string):Promise<string>}>('src/lib/ads-runtime.ts',{
    'server-only':{},
    'next/headers':{cookies:async()=>({get:(key:string)=>options.cookies?.[key] ? {value:options.cookies[key]} : undefined})},
    './auth-db':{getSessionUser:async()=>options.user??null},
    './seo-editor-access':{isSeoEditorId:()=>options.owner??false},
    './db-pool':{getDbPool:()=>({execute:async(sql:string)=>{assert.match(sql,/^SELECT/);reads++;if(options.dbError)throw new Error('secret connection error');return [options.row?[options.row]:[]];}})},
    './ads-store':{getAdsConfig:async()=>{if(options.settingsError)throw new Error('missing table');return {...config,enabled:options.enabled??true};}},
    './ads-registry-data.mjs':{isAdsRegistryReady:()=>true},
  });
  return {...loadedRuntime,reads:()=>reads};
}
test('runtime ignores analytics consent; only versioned advertising consent is recognized',async()=>{
  assert.equal((await runtime({cookies:{lfh_audience:'accepted'}}).getAdsRuntime()).reason,'consent_required');
  assert.equal((await runtime({cookies:{lfh_ad_consent:'v0:accepted'}}).getAdsRuntime()).effectiveEnabled,false);
  assert.equal((await runtime({cookies:{lfh_ad_consent:'v1%3Aaccepted'}}).getAdsRuntime()).effectiveEnabled,true);
});
test('runtime returns OFF on unknown session, failed Premium checks and storage errors',async()=>{
  const cookies={lfh_ad_consent:'v1:accepted',lumen_session:'test-session'};
  for(const options of [{user:null},{user:{id:'x'},dbError:true},{user:{id:'x'},row:null},{settingsError:true},{user:{id:'x'},row:{is_premium:1,period_end:'invalid'}}]) {
    const result=await runtime({...options,cookies}).getAdsRuntime();assert.equal(result.effectiveEnabled,false);assert.equal(result.reason,'unavailable');
  }
});
test('owners and current Premium are excluded; membership query is read-only; master OFF avoids it',async()=>{
  const cookies={lfh_ad_consent:'v1:accepted',lumen_session:'test-session'};
  assert.equal((await runtime({cookies,user:{id:'x'},owner:true}).getAdsRuntime()).reason,'owner');
  assert.equal((await runtime({cookies,user:{id:'x'},row:{is_premium:1,period_end:'2999-01-01'}}).getAdsRuntime()).reason,'premium');
  assert.equal((await runtime({cookies,user:{id:'x'},row:{is_premium:0}}).getAdsRuntime()).effectiveEnabled,true);
  const disabled=runtime({cookies,user:{id:'x'},enabled:false});assert.equal((await disabled.getAdsRuntime()).reason,'disabled');assert.equal(disabled.reads(),0);
});
