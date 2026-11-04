import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import { mountTrafficStarsAd, createAdSdkGuard } from '../src/lib/ads-sdk.ts';

test('OFF makes zero DOM or network work, including valid publisher spots', () => {
  let touched=0;
  const cleanup=mountTrafficStarsAd({placement:'header',spot:{kind:'banner',spotId:'a'.repeat(32),width:728,height:90,scriptUrl:'https://cdn.tsyndicate.com/sdk/v1/ms.js'},container:{} as HTMLElement,permitted:()=>false,onStart:()=>{touched++;}});
  cleanup(); assert.equal(touched,0);
});

test('revoked permission while a SDK loads prevents its invocation', async t => {
  const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const previousMedia=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
  t.after(()=>{for(const [key,old] of [['document',previousDocument],['window',previousWindow],['matchMedia',previousMedia]] as const) {if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);}});
  const scripts: Array<{src:string;dataset:Record<string,string>;onload?:()=>void;remove:()=>void}>=[];
  let invoked=0,started=0,allowed=true;
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({dataset:{},remove:()=>{}}),head:{appendChild:(script:typeof scripts[number])=>scripts.push(script)}}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{TSVideoShorts:()=>{invoked++;}}});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:false})});
  const cleanup=mountTrafficStarsAd({placement:'feed',spot:{kind:'feed',spotId:'b'.repeat(32),inFeed:true,scriptUrl:'https://cdn.tsyndicate.com/sdk/v1/video.shorts.js'},container:{id:'sample',isConnected:true,replaceChildren:()=>{}} as unknown as HTMLElement,permitted:()=>allowed,onStart:()=>{started++;}});
  assert.equal(scripts.length,1);assert.equal(started,1);
  allowed=false;scripts[0].onload?.();await Promise.resolve();await Promise.resolve();
  assert.equal(invoked,0);cleanup();
});

test('a configured slot cannot load scripts from an arbitrary host or for another format', async () => {
  const {isValidAdSpot,isAdsRegistryReady}=await import('../src/lib/ads-registry-data.mjs');
  const base={kind:'banner',spotId:'c'.repeat(32),width:728,height:90,scriptUrl:'https://cdn.tsyndicate.com/sdk/v1/ms.js'};
  assert.equal(isValidAdSpot(base),true);
  for(const scriptUrl of [undefined,'https://evil.example/sdk/v1/ms.js','https://cdn.tsyndicate.com:8443/sdk/v1/ms.js','http://cdn.tsyndicate.com/sdk/v1/ms.js','https://cdn.tsyndicate.com/sdk/v1/p.js','https://cdn.tsyndicate.com/sdk/v1/ms.js?x=1']) assert.equal(isValidAdSpot({...base,scriptUrl}),false,String(scriptUrl));
  assert.equal(isValidAdSpot({...base,scriptUrl:'https://cdn.fozekikikiminu.com/sdk/v1/dd.ms.js',domain:'evil.example'}),false);
  assert.equal(isAdsRegistryReady({}),false);
});

test('device changes after a global SDK require one clean reload before another variant starts',async()=>{
  let reloads=0;const guard=createAdSdkGuard(()=>{reloads++;});
  assert.equal(guard.check(false,0,'mobile'),true);assert.equal(reloads,0);
  assert.equal(guard.start('mobile',3),true);assert.equal(guard.start('mobile',3),true);
  assert.equal(guard.check(true,3,'desktop'),false);assert.equal(reloads,1);
  assert.equal(guard.start('desktop',3),false);guard.check(false,4,'desktop');assert.equal(reloads,1);
});
test('configuration change and revocation cannot keep or duplicate a global SDK',async()=>{
  for(const [allowed,revision] of [[false,3],[true,4]] as const){
    let reloads=0;const guard=createAdSdkGuard(()=>{reloads++;});
    guard.start('desktop',3);assert.equal(guard.check(allowed,revision,'desktop'),false);
    assert.equal(guard.start('desktop',revision),false);assert.equal(reloads,1);
  }
});

test('the mobile popunder keeps its device filter and session cap and waits for a trusted click',async t=>{
  const {ADS_REGISTRY}=await import('../src/lib/ads-registry-data.mjs');
  const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
  const previousMedia=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
  t.after(()=>{for(const [key,old] of [['document',previousDocument],['matchMedia',previousMedia]] as const){if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);}});
  let click:(event:{isTrusted:boolean})=>void=()=>{};const scripts:Array<{dataset:Record<string,string>}>=[];
  Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener:(_name:string,listener:typeof click)=>{click=listener;},removeEventListener:()=>{},createElement:()=>({dataset:{},remove:()=>{}})}});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:false})});
  const container={isConnected:true,appendChild:(script:typeof scripts[number])=>scripts.push(script),replaceChildren:()=>{}} as unknown as HTMLElement;
  const cleanup=mountTrafficStarsAd({placement:'popunder',spot:ADS_REGISTRY.popunder.mobile as never,container,permitted:()=>true,onStart:()=>true});
  assert.equal(scripts.length,0);click({isTrusted:false});assert.equal(scripts.length,0);
  click({isTrusted:true});assert.equal(scripts.length,1);
  assert.equal(scripts[0].dataset.tsDevices,'mobile');assert.equal(scripts[0].dataset.tsCount,'1');assert.equal(scripts[0].dataset.tsSessionDuration,'300');
  assert.equal(scripts[0].dataset.tsFirstDelay,'5');assert.equal(scripts[0].dataset.tsDelay,'60');cleanup();
});

test('all registered device variants are distinct and interstitial cookie units mean five minutes',async()=>{
  const {ADS_REGISTRY,isAdsRegistryReady}=await import('../src/lib/ads-registry-data.mjs');
  assert.equal(isAdsRegistryReady(Object.fromEntries(Object.keys(ADS_REGISTRY).map(key=>[key,true]))),true);
  assert.equal(new Set(Object.values(ADS_REGISTRY).flatMap(pair=>[pair.desktop.spotId,pair.mobile.spotId])).size,14);
  for(const value of Object.values(ADS_REGISTRY.interstitial)){
    assert.equal(value.countdown,5);assert.equal(value.countClicks,3);assert.equal(value.cookieExpires*3_600_000,300_000);
  }
});

test('profile pop caps and reporting labels reach the SDK without changing its cookie identity',async t=>{
  const {ADS_REGISTRY}=await import('../src/lib/ads-registry-data.mjs');
  const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldMedia=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
  t.after(()=>{for(const [key,old] of [['document',oldDocument],['matchMedia',oldMedia]] as const){if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);}});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:true})});
  for(const [profile,count,delay] of [['balanced',2,30],['intensive',3,5]] as const){
    const scripts:Array<{dataset:Record<string,string>}>=[];let click:(event:{isTrusted:boolean})=>void=()=>{};
    Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener:(_name:string,listener:typeof click)=>{click=listener;},removeEventListener:()=>{},createElement:()=>({dataset:{},remove:()=>{}})}});
    const container={isConnected:true,appendChild:(script:typeof scripts[number])=>scripts.push(script),replaceChildren:()=>{}} as unknown as HTMLElement;
    const cleanup=mountTrafficStarsAd({profile,placement:'popunder',spot:{...ADS_REGISTRY.popunder.desktop,count,delay} as never,container,permitted:()=>true,onStart:()=>true});
    assert.equal(scripts.length,profile==='intensive'?1:0);click({isTrusted:true});assert.equal(scripts.length,1);
    assert.equal(scripts[0].dataset.tsCount,String(count));assert.equal(scripts[0].dataset.tsDelay,String(delay));
    assert.equal(scripts[0].dataset.tsSubid,`lfh_${profile}_popunder_desktop`);
    assert.equal(scripts[0].dataset.tsSpot,ADS_REGISTRY.popunder.desktop.spotId);cleanup();
  }
});

test('intensive popunder arms on current eligibility, without a synthetic click or a new cookie or cap',async t=>{
  const {ADS_REGISTRY}=await import('../src/lib/ads-registry-data.mjs');
  const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldMedia=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
  t.after(()=>{for(const [key,old] of [['document',oldDocument],['matchMedia',oldMedia]] as const){if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);}});
  let wrapperListeners=0,starts=0;const scripts:Array<{dataset:Record<string,string>}>=[];
  Object.defineProperty(globalThis,'document',{configurable:true,value:{addEventListener:()=>{wrapperListeners++;},removeEventListener:()=>{},createElement:()=>({dataset:{},remove:()=>{}})}});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:false})});
  const container={isConnected:true,appendChild:(script:typeof scripts[number])=>scripts.push(script),replaceChildren:()=>{}} as unknown as HTMLElement;
  const spot={...ADS_REGISTRY.popunder.mobile,count:3,delay:5,firstDelay:0,mode:undefined};
  const cleanup=mountTrafficStarsAd({profile:'intensive',placement:'popunder',spot:spot as never,container,permitted:()=>true,onStart:()=>{starts++;return true;}});
  assert.equal(scripts.length,1);assert.equal(wrapperListeners,0);assert.equal(starts,1);
  assert.equal(scripts[0].dataset.tsCount,'3');assert.equal(scripts[0].dataset.tsSessionDuration,'300');assert.equal(scripts[0].dataset.tsDelay,'5');
  assert.equal(scripts[0].dataset.tsFirstDelay,'0');assert.equal(scripts[0].dataset.tsMode,undefined);assert.equal(scripts[0].dataset.tsDevices,'mobile');
  assert.equal(scripts[0].dataset.tsSpot,ADS_REGISTRY.popunder.mobile.spotId);assert.equal(scripts[0].dataset.tsCookieName,undefined);
  cleanup();
  const before=scripts.length;
  for(const permitted of [()=>false,()=>true])mountTrafficStarsAd({profile:'intensive',placement:'popunder',spot:spot as never,container,permitted,onStart:()=>false})();
  assert.equal(scripts.length,before);
});

test('the intensive native interstitial receives zero clicks with the unchanged close timer and cookie identity',async t=>{
  // @ts-expect-error Native Node requires explicit suffixes.
  const {loadAppModule}=await import('./helpers/load-app-module.ts');
  const {adSpotFor}=loadAppModule<{adSpotFor:(profile:string,placement:string,device:string)=>Record<string,unknown>}>('src/lib/ads-profiles.ts');
  const before={document:Object.getOwnPropertyDescriptor(globalThis,'document'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),matchMedia:Object.getOwnPropertyDescriptor(globalThis,'matchMedia')};
  t.after(()=>{for(const [key,old] of Object.entries(before)){if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);}});
  const scripts:Array<{dataset:Record<string,string>;onload?:()=>void}>=[],options:Array<Record<string,unknown>>=[];
  Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:()=>({}),createElement:()=>({dataset:{},remove:()=>{}}),head:{appendChild:(script:typeof scripts[number])=>scripts.push(script)}}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{InterstitialTsAd:(value:Record<string,unknown>)=>options.push(value)}});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:false})});
  const cleanup=mountTrafficStarsAd({profile:'intensive',placement:'interstitial',spot:adSpotFor('intensive','interstitial','mobile') as never,
    container:{id:'fixture-global',isConnected:true,replaceChildren:()=>{}} as unknown as HTMLElement,permitted:()=>true,onStart:()=>true});
  assert.equal(scripts.length,1);assert.equal(options.length,0);scripts[0].onload?.();await Promise.resolve();await Promise.resolve();
  assert.equal(options.length,1);assert.equal(options[0].countClicks,0);assert.equal(options[0].countdown,5);
  assert.equal(options[0].cookieName,'lfh_ts_interstitial_v1');assert.equal(options[0].cookieExpires,5/60);assert.equal(options[0].autoXu,false);
  assert.equal(options[0].subid,'lfh_intensive_interstitial_mobile');cleanup();
});
