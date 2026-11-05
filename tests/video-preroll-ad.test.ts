import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import React from 'react';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import {getDictionary} from '../src/lib/i18n/dictionaries.ts';

type Element = React.ReactElement<Record<string, unknown>>;
type Control = {request:()=>boolean;cancel:()=>void};
const nodes=(value:unknown):Element[]=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value as Element,...nodes((value.props as Record<string,unknown>).children)]:[];
const equal=(a:unknown[],b:unknown[])=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
function hooksHarness() {
 let index=0,dirty=true;const cells:unknown[]=[];let pending:Array<()=>void>=[];
 const hooks={...React,
  useState:(initial:unknown)=>{const i=index++;if(!(i in cells)){const cell={value:typeof initial==='function'?initial():initial,set:(value:unknown)=>{const next=typeof value==='function'?value(cell.value):value;if(!Object.is(next,cell.value)){cell.value=next;dirty=true;}}};cells[i]=cell;}const cell=cells[i] as {value:unknown;set:(value:unknown)=>void};return[cell.value,cell.set];},
  useRef:(initial:unknown)=>{const i=index++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
  useId:()=>{index++;return 'synthetic-preroll';},
  useCallback:(callback:unknown,deps:unknown[])=>{const i=index++,old=cells[i] as {deps:unknown[];callback:unknown}|undefined;if(!old||!equal(old.deps,deps))cells[i]={deps,callback};return(cells[i] as {callback:unknown}).callback;},
  useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const i=index++,old=cells[i] as {deps:unknown[];cleanup?:()=>void}|undefined;if(!old||!equal(old.deps,deps)){const cell={deps,cleanup:undefined as (()=>void)|undefined};cells[i]=cell;pending.push(()=>{old?.cleanup?.();cell.cleanup=effect()||undefined;});}},
  useImperativeHandle:(ref:{current:unknown},create:()=>unknown,deps:unknown[])=>hooks.useEffect(()=>{ref.current=create();return()=>{ref.current=null;};},deps),
 };
 const render=(fn:()=>unknown,attach?:(tree:unknown)=>void)=>{dirty=true;let tree:unknown;for(let n=0;n<30;n++){if(dirty){dirty=false;index=0;tree=fn();attach?.(tree);}const effects=pending;pending=[];effects.forEach(fn=>fn());if(!dirty&&!pending.length)return tree;}assert.fail('hooks did not settle');};
 return{hooks,render,unmount:()=>{for(const cell of cells)(cell as {cleanup?:()=>void}|null)?.cleanup?.();}};
}

function harness(t:TestContext,{allowed=true,profile='intensive',observer=true}={}){
 let permit=allowed,currentProfile=profile,revision=16,path='/fr/example_creator/1234',locale='fr',onscreen=true;
 const h=hooksHarness(),ref={current:null as Control|null},finishes:boolean[]=[],messages:unknown[]=[],timers=new Map<number,{fn:()=>void;ms:number}>();let timerId=0,disconnected=false;
 const windowMock=Object.assign(new EventTarget(),{innerHeight:844,innerWidth:390,setTimeout:(fn:()=>void,ms:number)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:(id:number)=>timers.delete(id)});
 const doc=Object.assign(new EventTarget(),{hidden:false});
 const shell={current:{getBoundingClientRect:()=>onscreen?{left:0,top:20,right:390,bottom:260,width:390,height:240}:{left:0,top:900,right:390,bottom:1140,width:390,height:240}}};
 const contentWindow={postMessage:(message:unknown,origin:string)=>{assert.equal(origin,'https://site.test');messages.push(message);}};
 const frame={contentWindow,getBoundingClientRect:()=>shell.current.getBoundingClientRect()};
 let intersection:IntersectionObserverCallback|undefined;
 const original={window:globalThis.window,document:globalThis.document,location:globalThis.location,matchMedia:globalThis.matchMedia,IntersectionObserver:globalThis.IntersectionObserver};
 Object.assign(globalThis,{window:windowMock,document:doc,location:{origin:'https://site.test'},matchMedia:()=>({matches:false}),IntersectionObserver:observer?class{constructor(callback:IntersectionObserverCallback){intersection=callback;}observe(){}disconnect(){disconnected=true;}}:undefined});
 const ads={get runtime(){return{profile:currentProfile,revision};},canServe:(placement:string)=>permit&&placement==='underVideo',markSdkStarted:()=>permit};
 const {VideoPrerollAd}=loadAppModule<{VideoPrerollAd:(p:unknown)=>unknown}>('src/components/VideoPrerollAd.tsx',{
  react:h.hooks,'next/navigation':{usePathname:()=>path},'./AdsProvider':{useAds:()=>ads},'./LocaleProvider':{useLocale:()=>({locale})},
 });
 const props={controller:ref,shell,onFinish:(resume:boolean)=>finishes.push(resume)};
 let tree:unknown;
 const render=()=>{tree=h.render(()=>VideoPrerollAd(props),value=>{const iframe=nodes(value).find(e=>e.type==='iframe');if(iframe)(iframe.props.ref as {current:unknown}).current=frame;});return tree;};
 const iframe=()=>nodes(tree).find(e=>e.type==='iframe');
 const request=()=>{const intercepted=ref.current!.request();render();return intercepted;};
 const status=(status:string,override:Record<string,unknown>={},eventOverride:Record<string,unknown>={})=>{
  const query=new URL(String(iframe()?.props.src),'https://site.test').searchParams;
  const event=Object.assign(new Event('message'),{origin:'https://site.test',source:contentWindow,data:{type:'lfh-ad-status',placement:'underVideo',context:'preroll',nonce:query.get('nonce'),status,...override},...eventOverride});windowMock.dispatchEvent(event);render();
 };
 render();t.after(()=>{h.unmount();Object.assign(globalThis,original);});
 return{request,render,iframe,finishes,messages,timers,status,doc,
  allow(value:boolean){permit=value;render();},profile(value:string){currentProfile=value;render();},revision(){revision++;render();},path(){path='/fr/other_creator/5678';render();},locale(){locale='en';render();},
  cancel(){ref.current!.cancel();render();},hidden(){doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));render();},
  leave(){onscreen=false;intersection?.([{target:frame,isIntersecting:false,intersectionRatio:0}] as unknown as IntersectionObserverEntry[],{} as IntersectionObserver);render();},
  load(){(iframe()?.props.onLoad as (e:unknown)=>void)?.({currentTarget:frame});render();},
  timeout(ms:number){const entry=[...timers].find(([,v])=>v.ms===ms);assert.ok(entry,`missing ${ms}ms deadline`);timers.delete(entry[0]);entry[1].fn();render();},
  unmount(){h.unmount();return disconnected;},
 };
}

test('nothing loads until explicit first Play; it creates only a local preroll document',t=>{
 const ui=harness(t);assert.equal(ui.iframe(),undefined);assert.equal(ui.messages.length,0);assert.equal(ui.request(),true);
 const frame=ui.iframe()!,url=new URL(String(frame.props.src),'https://site.test');assert.equal(url.pathname,'/api/ads/preroll');assert.deepEqual([...url.searchParams.keys()].sort(),['device','locale','nonce','path']);assert.equal(url.searchParams.get('path'),'/fr/example_creator/1234');assert.equal(url.searchParams.get('locale'),'fr');assert.equal(url.searchParams.get('device'),'mobile');assert.ok(url.searchParams.get('nonce'));
 assert.equal(ui.request(),true);assert.equal(ui.finishes.length,0);ui.status('ended');assert.deepEqual(ui.finishes,[true]);assert.equal(ui.request(),false);assert.equal(ui.iframe(),undefined);
});

test('only Intensive plus current permission permits the first attempt; refusal never re-arms it',async t=>{
 for(const profile of ['current','balanced'])await t.test(profile,sub=>{const ui=harness(sub,{profile});assert.equal(ui.request(),false);assert.equal(ui.iframe(),undefined);});
 for(const reason of ['refused','Premium','owner','OFF','unresolved'])await t.test(reason,sub=>{const ui=harness(sub,{allowed:false});assert.equal(ui.request(),false);ui.allow(true);assert.equal(ui.request(),false);assert.equal(ui.iframe(),undefined);});
});

test('messages require exact source, origin, context, nonce, placement and known terminal status',async t=>{
 const cases:Array<[Record<string,unknown>,Record<string,unknown>]>=[[{}, {origin:'https://other.test'}],[{}, {source:{}}],[{nonce:'wrong'},{}],[{context:'pause'},{}],[{placement:'header'},{}],[{type:'ad-status'},{}],[{status:'loaded'},{}]];
 for(const [data,event] of cases)await t.test(JSON.stringify({...data,...event}),sub=>{const ui=harness(sub);ui.request();ui.status('ended',data,event);assert.ok(ui.iframe());assert.deepEqual(ui.finishes,[]);});
});

test('loaded iframe never proves fill; decoded filled replaces setup timeout and completion resumes once',t=>{
 const ui=harness(t);ui.request();ui.load();assert.ok([...ui.timers.values()].some(v=>v.ms===15_000));assert.deepEqual(ui.finishes,[]);
 ui.status('filled');assert.equal([...ui.timers.values()].some(v=>v.ms===15_000),false);assert.ok([...ui.timers.values()].some(v=>v.ms===125_000));
 ui.status('skipped');assert.deepEqual(ui.finishes,[true]);assert.equal(ui.iframe(),undefined);assert.equal(ui.timers.size,0);
});

test('absence of fill is bounded to 15 seconds and a filled ad cannot block content forever',async t=>{
 for(const filled of [false,true])await t.test(String(filled),sub=>{const ui=harness(sub);ui.request();if(filled)ui.status('filled');ui.timeout(filled?125_000:15_000);assert.deepEqual(ui.finishes,[true]);assert.equal(ui.request(),false);});
});

test('withdrawal, revision/path changes, cancel, hidden/offscreen and unmount cannot resume main',async t=>{
 for(const reason of ['permission','profile','revision','path','cancel','hidden','offscreen','unmount'])await t.test(reason,sub=>{
  const ui=harness(sub);ui.request();ui.load();
  if(reason==='permission')ui.allow(false);if(reason==='profile')ui.profile('balanced');if(reason==='revision')ui.revision();if(reason==='path')ui.path();if(reason==='cancel')ui.cancel();if(reason==='hidden')ui.hidden();if(reason==='offscreen')ui.leave();if(reason==='unmount')ui.unmount();
  assert.equal(ui.finishes.includes(true),false);assert.equal(ui.timers.size,0);if(reason!=='unmount'){assert.equal(ui.iframe(),undefined);assert.equal(ui.request(),false);}
 });
});

test('visibility messages attest activation only after Play and only while actually visible',t=>{
 const ui=harness(t);assert.equal(ui.messages.length,0);ui.request();ui.load();
 assert.ok(ui.messages.some(value=>(value as {activated?:boolean;visible?:boolean}).activated===true&&(value as {visible?:boolean}).visible===true));
 assert.ok(ui.messages.every(value=>(value as {context:string}).context==='preroll'));ui.leave();assert.equal((ui.messages.at(-1) as {visible:boolean}).visible,false);
});

test('without IntersectionObserver geometric visibility still gates the local frame',t=>{const ui=harness(t,{observer:false});assert.equal(ui.request(),true);ui.load();assert.ok(ui.messages.some(value=>(value as {visible:boolean}).visible));});

function playerHarness(t:TestContext,{preroll=true,autoPlay=false,intercept=true,rejectPlay=false}={}){
 const originalDocument=globalThis.document;const documentMock={hidden:false};Object.assign(globalThis,{document:documentMock});
 const h=hooksHarness(),dictionary=getDictionary('en'),Pre=()=>null,Pause=()=>null;let playCalls=0,pauseCalls=0,cancelCalls=0;
 const fake={paused:true,duration:12,currentTime:0,error:null,muted:false,play(){playCalls++;if(rejectPlay&&playCalls===1)return Promise.reject(Object.assign(new Error('browser policy'),{name:'NotAllowedError'}));this.paused=false;return Promise.resolve();},pause(){pauseCalls++;this.paused=true;},load(){}};
 const {VideoPlayer}=loadAppModule<{VideoPlayer:(p:unknown)=>Element}>('src/components/VideoPlayer.tsx',{
  react:h.hooks,'./VideoPrerollAd':{VideoPrerollAd:Pre},'./VideoPauseAd':{VideoPauseAd:Pause},'./LocaleProvider':{useLocale:()=>({dictionary,locale:'en'})},
 });
 const keyed=VideoPlayer({src:'/synthetic.mp4',preroll,autoPlay}),Source=keyed.type as (props:unknown)=>unknown;let tree:unknown;
 const requests:string[]=[];let intercepted=false;const control={request:(mode="preroll")=>{requests.push(mode);if(intercepted)return false;intercepted=true;return intercept;},cancel:()=>{cancelCalls++;(nodes(tree).find(e=>e.type===Pre)!.props.onFinish as (value:boolean)=>void)(false);}};
 const render=()=>{tree=h.render(()=>Source(keyed.props),value=>{for(const node of nodes(value)){if(node.type==='video')(node.props.ref as {current:unknown}).current=fake;if(node.type===Pre)(node.props.controller as {current:unknown}).current=control;}});};
 render();t.after(()=>{h.unmount();Object.assign(globalThis,{document:originalDocument});});
 return{render,fake,requests,sourceKey:keyed.key,replacementKey:()=>VideoPlayer({src:"/replacement.mp4",preroll,autoPlay}).key,document:documentMock,unmount:h.unmount,media:()=>nodes(tree).find(e=>e.type==='video')!,hasRetry:()=>nodes(tree).some(e=>e.type==='button'&&e.props.children===dictionary.video.retry),playCalls:()=>playCalls,pauseCalls:()=>pauseCalls,cancelCalls:()=>cancelCalls,leaf:()=>nodes(tree).find(e=>e.type===Pre),
  click(){const button=nodes(tree).find(e=>e.type==='button'&&[dictionary.feed.play,dictionary.feed.pause].includes(e.props['aria-label'] as string));assert.ok(button);(button.props.onClick as ()=>void)();render();},
  playing(){(nodes(tree).find(e=>e.type==='video')!.props.onPlaying as (event:unknown)=>void)({currentTarget:fake});render();},
  time(duration:number,currentTime:number){fake.duration=duration;fake.currentTime=currentTime;(nodes(tree).find(e=>e.type==='video')!.props.onTimeUpdate as ()=>void)();render();},
  finish(value:boolean){(nodes(tree).find(e=>e.type===Pre)!.props.onFinish as (value:boolean)=>void)(value);render();},
 };
}

test('real media player delays its main play Promise until the controller completes, then resumes once',t=>{
 const ui=playerHarness(t);ui.click();assert.equal(ui.playCalls(),0);ui.finish(true);assert.equal(ui.playCalls(),1);ui.finish(true);assert.equal(ui.playCalls(),1);
});

test('cancelling a pending user Play cannot start content from a late terminal callback',t=>{
 const ui=playerHarness(t);ui.click();ui.click();assert.equal(ui.cancelCalls(),1);ui.finish(true);assert.equal(ui.playCalls(),0);
});

test('default and autoplay players never mount the preroll controller; ineligible play stays immediate',async t=>{
 await t.test('default',sub=>{const ui=playerHarness(sub,{preroll:false});assert.equal(ui.leaf(),undefined);ui.click();assert.equal(ui.playCalls(),1);});
 await t.test('autoplay',sub=>{const ui=playerHarness(sub,{autoPlay:true});assert.equal(ui.leaf(),undefined);assert.equal(ui.playCalls(),1);});
 await t.test('ineligible',sub=>{const ui=playerHarness(sub,{intercept:false});ui.click();assert.equal(ui.playCalls(),1);});
});


test('late terminal cannot start main playback in a hidden document, after source replacement or unmount',async t=>{
 for(const reason of ['hidden','source','unmount'])await t.test(reason,sub=>{
  const ui=playerHarness(sub);ui.click();
  if(reason==='hidden')ui.document.hidden=true;
  if(reason==='source')(ui.media().props.ref as {current:unknown}).current={...ui.fake};
  if(reason==='unmount')ui.unmount();
  ui.finish(true);assert.equal(ui.playCalls(),0);
 });
});

test('a native main-media failure cancels an active preroll instead of replaying after a late completion',t=>{
 const ui=playerHarness(t);ui.click();(ui.media().props.onError as ()=>void)();ui.render();ui.finish(true);assert.equal(ui.playCalls(),0);assert.equal(ui.cancelCalls(),1);
});


test('locale updates cannot navigate the active child into another advertising attempt',t=>{
 const ui=harness(t);ui.request();const src=ui.iframe()!.props.src;ui.locale();assert.equal(ui.iframe()!.props.src,src);ui.status('empty');assert.deepEqual(ui.finishes,[true]);
});

test('a tab hidden by another same-gesture action cannot fall through an ineligible preroll into main audio',t=>{
 const ui=playerHarness(t,{intercept:false});ui.document.hidden=true;ui.click();assert.equal(ui.playCalls(),0);
});


test('a browser-policy rejection after the ad leaves normal Play available without a broken-file error or second ad',async t=>{
 const ui=playerHarness(t,{rejectPlay:true});ui.click();ui.finish(true);await new Promise<void>(resolve=>setImmediate(resolve));ui.render();
 assert.equal(ui.playCalls(),1);assert.equal(ui.hasRetry(),false);ui.click();assert.equal(ui.playCalls(),2);
});

test('background deadlines and terminal messages fail closed even before visibilitychange is delivered',async t=>{
 for(const signal of ['timeout','empty'])await t.test(signal,sub=>{
  const ui=harness(sub);ui.request();ui.doc.hidden=true;
  if(signal==='timeout')ui.timeout(15_000);else ui.status('empty');
  assert.deepEqual(ui.finishes,[false]);assert.equal(ui.request(),false);
 });
});


test('user Play has one preroll but near-end timeupdates across repeated loops never request a postroll',t=>{
 const ui=playerHarness(t);assert.equal(ui.media().props.loop,true);ui.click();assert.deepEqual(ui.requests,['preroll']);ui.finish(true);ui.playing();
 for(let loop=0;loop<3;loop++){ui.time(12,0);ui.time(12,11.3);ui.time(12,11.5);ui.time(12,11.99);}
 assert.deepEqual(ui.requests,['preroll']);assert.equal(ui.pauseCalls(),0);assert.equal(ui.playCalls(),1);assert.equal(ui.media().props.loop,true);
});

test('only a new media source owns fresh state; loops and manual replay never re-arm preroll',async t=>{
 await t.test('replay',sub=>{const ui=playerHarness(sub);ui.click();ui.finish(true);ui.playing();ui.click();ui.click();assert.equal(ui.playCalls(),2);assert.equal(ui.pauseCalls(),1);assert.equal(ui.requests.length,2);assert.equal(ui.sourceKey,'/synthetic.mp4');assert.notEqual(ui.sourceKey,ui.replacementKey());});
 for(const label of ['original source','replacement source'])await t.test(label,sub=>{const ui=harness(sub);assert.equal(ui.request(),true);ui.status('skipped');assert.equal(ui.request(),false);assert.equal(ui.iframe(),undefined);});
});
