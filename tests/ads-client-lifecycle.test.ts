import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import React from 'react';
import {ADS_REGISTRY,isAdsRegistryReady} from '../src/lib/ads-registry-data.mjs';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import {createAdSdkGuard} from '../src/lib/ads-sdk.ts';

type Element=React.ReactElement<Record<string,unknown>>;
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const all=(value:unknown,predicate:(element:Element)=>boolean):Element[]=>Array.isArray(value)?value.flatMap(child=>all(child,predicate)):React.isValidElement(value)?[...(predicate(value as Element)?[value as Element]:[]),...all((value.props as Record<string,unknown>).children,predicate)]:[];
const same=(a:unknown[]|undefined,b:unknown[]|undefined)=>Boolean(a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index])));

function hookHarness(){
  let cursor=0;const cells:unknown[]=[];let effects:Array<()=>void>=[];
  const hooks={...React,
    useState:(initial:unknown)=>{const index=cursor++;if(!(index in cells))cells[index]=typeof initial==='function'?initial():initial;return[cells[index],(value:unknown)=>{cells[index]=typeof value==='function'?value(cells[index]):value;}];},
    useRef:(initial:unknown)=>{const index=cursor++;if(!(index in cells))cells[index]={current:initial};return cells[index];},
    useCallback:(callback:unknown,deps:unknown[])=>{const index=cursor++;const old=cells[index] as {deps:unknown[];callback:unknown}|undefined;if(!old||!same(old.deps,deps))cells[index]={deps,callback};return (cells[index] as {callback:unknown}).callback;},
    useEffect:(callback:()=>void|(()=>void),deps:unknown[])=>{const index=cursor++;const old=cells[index] as {deps:unknown[];cleanup?:()=>void}|undefined;if(!old||!same(old.deps,deps)){const next={deps,cleanup:undefined as (()=>void)|undefined};cells[index]=next;effects.push(()=>{old?.cleanup?.();next.cleanup=callback()||undefined;});}},
    useId:()=> 'sample-slot',
  };
  return{hooks,render<T>(component:()=>T){cursor=0;const result=component();const next=effects;effects=[];next.forEach(effect=>effect());return result;},close(){for(const cell of cells){const entry=cell as {cleanup?:()=>void}|null;entry?.cleanup?.();}}};
}

function browser(t:TestContext){
  let now=1000,id=0;const timers=new Map<number,{at:number;callback:()=>void;period?:number}>();
  const previous={window:globalThis.window,document:globalThis.document,location:globalThis.location,matchMedia:globalThis.matchMedia};
  const events=new EventTarget();
  const windowMock=Object.assign(events,{setTimeout:(callback:()=>void,delay:number)=>{const key=++id;timers.set(key,{at:now+delay,callback});return key;},clearTimeout:(key:number)=>timers.delete(key),setInterval:(callback:()=>void,period:number)=>{const key=++id;timers.set(key,{at:now+period,callback,period});return key;},clearInterval:(key:number)=>timers.delete(key),location:{reload:()=>{}}});
  const documentMock=Object.assign(new EventTarget(),{cookie:'lfh_ad_consent=v2%3Aaccepted'});
  const media=Object.assign(new EventTarget(),{matches:false});
  Object.assign(globalThis,{window:windowMock,document:documentMock,location:{origin:'https://example.test'},matchMedia:()=>media});
  t.mock.method(Date,'now',()=>now);
  return{window:windowMock,document:documentMock,media,restore:()=>Object.assign(globalThis,previous),jump(ms:number){now+=ms;},advance(ms:number){const target=now+ms;for(;;){const due=[...timers].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;if(due[1].period)due[1].at+=due[1].period;else timers.delete(due[0]);due[1].callback();}now=target;}};
}

const placements={header:true,footer:true,underVideo:true,feed:true,popunder:true,interstitial:true,slider:true};
const eligible={enabled:true,effectiveEnabled:true,revision:4,needsConsent:false,consent:'accepted',placements,reason:'eligible'};
type Snapshot={consentOffered:boolean;consentAvailable:boolean;canServe:(placement:string)=>boolean;runtime:typeof eligible|null;choose:(choice:'accepted'|'refused')=>Promise<boolean>};
function provider(t:TestContext,initialTransport:(input?:RequestInfo|URL,init?:RequestInit)=>Promise<Response>,probe?:unknown,registryReady?:typeof isAdsRegistryReady){
  const environment=browser(t),hooks=hookHarness();let transport=initialTransport;
  const previousFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>transport(input,init);
  const {AdsProvider}=loadAppModule<{AdsProvider:(props:{children:React.ReactNode})=>React.ReactElement<{value:Snapshot}>}>('src/components/AdsProvider.tsx',{
    react:hooks.hooks,...(probe?{'@/lib/ads-mediation':{probeAdMediation:probe}}:{}),'@/lib/ads-sdk':{createAdSdkGuard},'@/lib/ads-registry':{isAdsRegistryReady:registryReady??isAdsRegistryReady},
    'next/navigation':{usePathname:()=>'/en'},'./AgeConfirmation':{useAgeConfirmation:()=>({confirmed:true})},
    './Session':{useSession:()=>({loading:false,user:null})},'./Premium':{usePremium:()=>({ready:true,isPremium:false})}
  });
  t.after(()=>{hooks.close();environment.restore();globalThis.fetch=previousFetch;});
  return{...environment,render:()=>hooks.render(()=>AdsProvider({children:null})).props.value,setTransport:(next:typeof transport)=>{transport=next;},refresh(){environment.window.dispatchEvent(new Event('focus'));}};
}

test('a configured pending runtime offers an informed consent choice but cannot serve any advertising',t=>{
  const ui=provider(t,()=>new Promise(()=>{}));const value=ui.render();
  assert.equal(value.consentOffered,true);
  for(const key of Object.keys(placements))assert.equal(value.canServe(key),false);
});

test('the separate advertising caller submits its newly disclosed v2 choice explicitly',async t=>{
  const ui=provider(t,async()=>Response.json(eligible));ui.render();await flush();
  const writes:RequestInit[]=[];ui.setTransport(async(input,init)=>{
    if(input==='/api/ads/consent'){assert.ok(init);writes.push(init);return new Response(null,{status:204});}
    return Response.json(eligible);
  });
  assert.equal(await ui.render().choose('accepted'),true);
  assert.equal(writes.length,1);
  assert.deepEqual(JSON.parse(String(writes[0].body)),{choice:'accepted',ageConfirmed:true,version:'v2'});
});

test('a failed separate refusal still records a current local refusal and blocks serving immediately',async t=>{
  const ui=provider(t,async()=>Response.json(eligible));ui.render();await flush();assert.equal(ui.render().canServe('header'),true);
  ui.setTransport(async()=>{throw new TypeError('network');});
  assert.equal(await ui.render().choose('refused'),true);
  assert.match(ui.document.cookie,/^lfh_ad_consent=v2:refused;/);
  assert.equal(ui.render().canServe('header'),false);
});

test('a transport failure preserves only the original twenty-second runtime lifetime',async t=>{
  const ui=provider(t,async()=>Response.json(eligible));ui.render();await flush();assert.equal(ui.render().canServe('header'),true);
  ui.advance(5000);ui.setTransport(async()=>{throw new TypeError('network');});ui.refresh();await flush();
  assert.equal(ui.render().canServe('header'),true);
  ui.advance(14_999);await flush();assert.equal(ui.render().canServe('header'),true);
  ui.advance(1);assert.equal(ui.render().canServe('header'),false);
});

test('background timer throttling cannot authorize an expired runtime at the point of serving',async t=>{
  const ui=provider(t,async()=>Response.json(eligible));ui.render();await flush();const value=ui.render();assert.equal(value.canServe('header'),true);
  ui.jump(20_001);assert.equal(value.canServe('header'),false);assert.equal(ui.render().canServe('header'),false);
});

test('an explicit denial received after its request timed out cannot restore the prior eligible response',async t=>{
  const ui=provider(t,async()=>Response.json(eligible));ui.render();await flush();assert.equal(ui.render().canServe('header'),true);
  let finish!:(response:Response)=>void;ui.setTransport(()=>new Promise(resolve=>{finish=resolve;}));ui.refresh();ui.advance(4000);
  finish(Response.json({...eligible,enabled:false,effectiveEnabled:false,reason:'disabled'}));await flush();
  assert.equal(ui.render().canServe('header'),false);assert.equal(ui.render().consentOffered,false);
});

test('explicit denials, malformed JSON and unsuccessful HTTP responses never preserve an eligible runtime',async t=>{
  for(const [name,response] of [
    ['OFF',()=>Response.json({...eligible,enabled:false,effectiveEnabled:false,reason:'disabled'})],
    ['owner',()=>Response.json({...eligible,effectiveEnabled:false,reason:'owner'})],
    ['Premium',()=>Response.json({...eligible,effectiveEnabled:false,reason:'premium'})],
    ['refused',()=>Response.json({...eligible,effectiveEnabled:false,consent:'refused',reason:'consent_refused'})],
    ['malformed',()=>new Response('{broken',{status:200})],
    ['HTTP503',()=>new Response(null,{status:503})],
  ] as const)await t.test(name,async sub=>{
    const ui=provider(sub,async()=>Response.json(eligible));ui.render();await flush();assert.equal(ui.render().canServe('header'),true);
    ui.setTransport(async()=>response());ui.refresh();await flush();const denied=ui.render();assert.equal(denied.canServe('header'),false);
    if(name!=='refused')assert.equal(denied.consentOffered,false);
    ui.setTransport(async()=>{throw new TypeError('network');});ui.refresh();await flush();assert.equal(ui.render().canServe('header'),false);
  });
});

test('an unavailable first runtime never turns its pending offer into implicit consent or serving',async t=>{
  const ui=provider(t,async()=>{throw new TypeError('network');});ui.document.cookie='';assert.equal(ui.render().consentOffered,true);await flush();
  const value=ui.render();assert.equal(value.consentOffered,false);assert.equal(value.canServe('header'),false);
  assert.equal(ui.document.cookie,'');
});

function slot(t:TestContext,placement:'header'|'footer'|'feed'){
  const environment=browser(t),hooks=hookHarness();let allowed=true,empties=0;
  let profile:'current'|'balanced'|'intensive'=placement==='feed'?'balanced':'current',revision=4;
  const {AdSlot}=loadAppModule<{AdSlot:(props:{placement:string;onEmpty:()=>void})=>React.ReactElement}>('src/components/AdSlot.tsx',{
    react:hooks.hooks,'./AdsProvider':{useAds:()=>({runtime:{profile,revision},canServe:()=>allowed})},'./LocaleProvider':{useLocale:()=>({locale:'en'})},
    '@/lib/ads-registry':{ADS_REGISTRY},'@/lib/ads-sdk':{mountTrafficStarsAd:()=>{throw new Error('Inline slots cannot run a parent SDK.');}},'next/navigation':{usePathname:()=>placement==='feed'?'/feed':'/'}
  });
  const outer=AdSlot({placement,onEmpty:()=>{empties++;}}),Component=outer.type as (props:Record<string,unknown>)=>React.ReactElement|null;
  const render=()=>hooks.render(()=>Component(outer.props as Record<string,unknown>));
  const frame=()=>{render();const node=all(render(),value=>value.type==='iframe')[0];assert.ok(node);const ref=node.props.ref as {current:unknown};const element={contentWindow:{postMessage(){}}};ref.current=element;return{node,element,load:()=> (node.props.onLoad as (event:unknown)=>void)({currentTarget:element})};};
  t.after(()=>{hooks.close();environment.restore();});
  return{...environment,render,frame,empties:()=>empties,setAllowed:(value:boolean)=>{allowed=value;},setPolicy:(value:typeof profile,next:number)=>{profile=value;revision=next;}};
}

test('the visible header is eager while the lower footer keeps lazy loading',t=>{
  const header=slot(t,'header');assert.equal(header.frame().node.props.loading,'eager');
});
test('the lower footer remains lazy',t=>{
  const footer=slot(t,'footer');assert.equal(footer.frame().node.props.loading,'lazy');
});

test('a device change resets an old filled signal and cancels the old frame timeout',t=>{
  const ui=slot(t,'feed');const first=ui.frame();first.load();
  const filled=new Event('message');Object.assign(filled,{origin:'https://example.test',source:first.element.contentWindow,data:{type:'lfh-ad-status',placement:'feed',status:'filled'}});ui.window.dispatchEvent(filled);
  ui.media.matches=true;ui.media.dispatchEvent(new Event('change'));const second=ui.frame();
  ui.window.dispatchEvent(filled);second.load();
  assert.notEqual(first.node.key,second.node.key);
  ui.advance(10_000);assert.equal(ui.empties(),1);
});

test('revoking eligibility cancels a pending frame timeout before remounting',t=>{
  const ui=slot(t,'feed');ui.frame().load();ui.setAllowed(false);assert.equal(ui.render(),null);
  ui.advance(10_000);assert.equal(ui.empties(),0);
  ui.setAllowed(true);ui.frame().load();ui.advance(10_000);assert.equal(ui.empties(),1);
});

test('a saved profile revision replaces the frame and rejects filled messages from the prior profile',t=>{
  const ui=slot(t,'feed');const first=ui.frame();first.load();
  const filled=new Event('message');Object.assign(filled,{origin:'https://example.test',source:first.element.contentWindow,data:{type:'lfh-ad-status',placement:'feed',status:'filled'}});
  ui.window.dispatchEvent(filled);ui.setPolicy('intensive',5);const second=ui.frame();
  assert.notEqual(second.node.key,first.node.key);ui.window.dispatchEvent(filled);second.load();
  ui.advance(10_000);assert.equal(ui.empties(),1);
});


test('intensive waits for a single mediation choice and checks cookie/freshness at the exact probe callback',async t=>{
  let permitted!:()=>boolean,finish!:(value:'standard'|'alternative'|null)=>void,calls=0;
  const ui=provider(t,async()=>Response.json({...eligible,profile:'intensive'}),(allowed:()=>boolean)=>{calls++;permitted=allowed;return new Promise(resolve=>{finish=resolve;});});
  ui.render();await flush();
  assert.equal(ui.render().canServe('feed'),false);assert.equal(calls,1);assert.equal(permitted(),true);
  ui.document.cookie='lfh_ad_consent=v2:refused';assert.equal(permitted(),false);
  ui.document.cookie='lfh_ad_consent=v2:accepted';ui.jump(20_001);assert.equal(permitted(),false);
  finish('alternative');await flush();assert.equal(ui.render().canServe('feed'),false);
});

test('a resolved intensive branch allows eligible ads without repeating its probe on every render',async t=>{
  let finish!:(value:'standard')=>void,calls=0;
  const ui=provider(t,async()=>Response.json({...eligible,profile:'intensive'}),()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  ui.render();await flush();ui.render();assert.equal(calls,1);
  finish('standard');await flush();assert.equal(ui.render().canServe('feed'),true);ui.render();assert.equal(calls,1);
});

test('a fresh runtime restarts an undecided probe after expiry even when background timers never changed eligibility',async t=>{
  let finish!:()=>void,calls=0;
  const ui=provider(t,async()=>Response.json({...eligible,profile:'intensive'}),(permitted:()=>boolean)=>{
    calls++;return new Promise(resolve=>{finish=()=>resolve(permitted()?'standard':null);});
  });
  ui.render();await flush();ui.render();assert.equal(calls,1);
  ui.jump(20_001);finish();await flush();assert.equal(ui.render().canServe('feed'),false);
  ui.refresh();await flush();assert.equal(ui.render().canServe('feed'),false);
  assert.equal(calls,2,'Freshness renewal must retry the unresolved branch without requiring an eligibility toggle.');
  finish();await flush();assert.equal(ui.render().canServe('feed'),true);
});

test('a pending TS feed remains mounted after the old ten-second watchdog, without claiming filled',t=>{
 const ui=slot(t,'feed');const current=ui.frame();current.load();ui.advance(8_000);
 const pending=new Event('message');Object.assign(pending,{origin:'https://example.test',source:current.element.contentWindow,data:{type:'lfh-ad-status',placement:'feed',status:'pending'}});ui.window.dispatchEvent(pending);
 ui.advance(22_000);assert.equal(ui.empties(),0);current.load();ui.advance(10_000);assert.equal(ui.empties(),0);
 const empty=new Event('message');Object.assign(empty,{origin:'https://example.test',source:current.element.contentWindow,data:{type:'lfh-ad-status',placement:'feed',status:'empty'}});ui.window.dispatchEvent(empty);assert.equal(ui.empties(),1);
});
test('pending from a different window cannot disarm the feed watchdog',t=>{
 const ui=slot(t,'feed');const current=ui.frame();current.load();
 const forged=new Event('message');Object.assign(forged,{origin:'https://example.test',source:{},data:{type:'lfh-ad-status',placement:'feed',status:'pending'}});ui.window.dispatchEvent(forged);
 ui.advance(10_000);assert.equal(ui.empties(),1);
});
test('a different profile revision does not inherit the prior feed pending state',t=>{
 const ui=slot(t,'feed');const old=ui.frame();old.load();
 const pending=new Event('message');Object.assign(pending,{origin:'https://example.test',source:old.element.contentWindow,data:{type:'lfh-ad-status',placement:'feed',status:'pending'}});ui.window.dispatchEvent(pending);
 ui.setPolicy('intensive',5);const next=ui.frame();ui.window.dispatchEvent(pending);next.load();ui.advance(10_000);assert.equal(ui.empties(),1);
});


test('client format gates reject a raw unmasked legacy/current runtime and the balanced interstitial',async t=>{
 for(const profile of [undefined,'current','balanced','intensive'])await t.test(String(profile),async sub=>{
  const payload={...eligible,...(profile?{profile}:{})},ui=provider(sub,async()=>Response.json(payload));ui.render();await flush();
  if(profile==='intensive'){/* An undecided mediation remains closed by the existing contract. */return;}
  const current=ui.render();for(const placement of ['header','footer','underVideo'])assert.equal(current.canServe(placement),true);
  for(const placement of ['feed','popunder','slider'])assert.equal(current.canServe(placement),profile==='balanced');
  assert.equal(current.canServe('interstitial'),false);
 });
});


test('consent readiness requires only formats permitted by the saved level, not disabled global formats',async t=>{
 for(const profile of ['current','balanced'] as const)await t.test(profile,async sub=>{
  const checked:Array<Record<string,boolean>>=[];
  const ready=(value:Record<string,boolean>)=>{checked.push(value);return profile==='current'?!value.feed&&!value.popunder&&!value.interstitial&&!value.slider:!value.interstitial;};
  const ui=provider(sub,async()=>Response.json({...eligible,profile}),undefined,ready);ui.render();await flush();
  assert.equal(ui.render().consentOffered,true);assert.ok(checked.length>0);assert.equal(checked.at(-1)!.header,true);assert.equal(checked.at(-1)!.interstitial,false);
 });
});
