import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import React from 'react';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Element=React.ReactElement<Record<string,unknown>>;
const nodes=(value:unknown):Element[]=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value as Element,...nodes((value.props as Record<string,unknown>).children)]:[];
const equal=(a:unknown[],b:unknown[])=>a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
type Page={items:Array<{id:string}>;nextCursor:number|null;total:number;seed?:number};
type Props={initial:Page;params:{sort:string;q?:string}};
const page=(ids:string[],nextCursor:number|null):Page=>({items:ids.map(id=>({id})),nextCursor,total:100});

function harness(t:TestContext,initial=page(['initial'],1)){
 let hook=0,dirty=true,visible=false,tree:unknown,props:Props={initial,params:{sort:'recent'}},observeCalls=0;
 const cells:unknown[]=[];let effects:Array<()=>void>=[],notifications:Array<()=>void>=[];
 const requests:Array<{url:string;signal:AbortSignal;resolve:(response:Response)=>void;reject:(error:Error)=>void}>=[];
 const react={...React,
  useState:(initial:unknown)=>{const i=hook++;if(!(i in cells)){const cell={value:typeof initial==='function'?initial():initial,set:(next:unknown)=>{const value=typeof next==='function'?next(cell.value):next;if(!Object.is(value,cell.value)){cell.value=value;dirty=true;}}};cells[i]=cell;}const cell=cells[i] as {value:unknown;set:(v:unknown)=>void};return[cell.value,cell.set];},
  useRef:(initial:unknown)=>{const i=hook++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
  useCallback:(callback:unknown,deps:unknown[])=>{const i=hook++,previous=cells[i] as {deps:unknown[];callback:unknown}|undefined;if(!previous||!equal(previous.deps,deps))cells[i]={deps,callback};return(cells[i] as {callback:unknown}).callback;},
  useEffect:(effect:()=>void|(()=>void),deps:unknown[])=>{const i=hook++,previous=cells[i] as {deps:unknown[];cleanup?:()=>void}|undefined;if(!previous||!equal(previous.deps,deps)){const cell={deps,cleanup:undefined as undefined|(()=>void)};cells[i]=cell;effects.push(()=>{previous?.cleanup?.();cell.cleanup=effect()||undefined;});}},
 };
 class Observer{
  connected=false;target:unknown;callback:IntersectionObserverCallback;options:IntersectionObserverInit;constructor(callback:IntersectionObserverCallback,options:IntersectionObserverInit){this.callback=callback;this.options=options;observers.push(this);}
  observe(target:unknown){this.target=target;this.connected=true;observeCalls++;notifications.push(()=>{if(this.connected)this.emit(visible,visible?1:0);});}
  disconnect(){this.connected=false;}
  emit(isIntersecting:boolean,intersectionRatio:number){if(this.connected)this.callback([{target:this.target,isIntersecting,intersectionRatio}] as IntersectionObserverEntry[],this as unknown as IntersectionObserver);}
 }
 const observers:Observer[]=[];
 const before={fetch:globalThis.fetch,matchMedia:globalThis.matchMedia,IntersectionObserver:globalThis.IntersectionObserver};
 Object.assign(globalThis,{fetch:(url:string,options:{signal:AbortSignal})=>new Promise<Response>((resolve,reject)=>requests.push({url:String(url),signal:options.signal,resolve,reject})),matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),IntersectionObserver:Observer});
 const Card=()=>null;
 const {InfiniteGallery}=loadAppModule<{InfiniteGallery:(p:Props)=>unknown}>('src/components/InfiniteGallery.tsx',{
  react,'next/navigation':{usePathname:()=>'/fr'},'./LocaleProvider':{useLocale:()=>({t:(s:string)=>s})},
  './PhotoCard':{PhotoCard:Card},'./AdSlot':{AdSlot:()=>null},'./AdsProvider':{useAds:()=>({canServe:()=>false,runtime:{profile:'current'}})},
 });
 const drain=()=>{
  for(let turns=0;turns<40;turns++){
   if(dirty){dirty=false;hook=0;tree=InfiniteGallery(props);const sentinel=nodes(tree).find(e=>e.type==='div'&&e.props.ref);if(sentinel)(sentinel.props.ref as {current:unknown}).current={};}
   const currentEffects=effects;effects=[];currentEffects.forEach(fn=>fn());
   const currentNotifications=notifications;notifications=[];currentNotifications.forEach(fn=>fn());
   if(!dirty&&!effects.length&&!notifications.length)return;
  }
  assert.fail('render/observer loop did not settle');
 };
 const settle=async()=>{for(let i=0;i<3;i++){drain();await new Promise<void>(resolve=>setImmediate(resolve));}drain();};
 const notify=(intersecting:boolean,ratio=intersecting?1:0)=>{visible=intersecting;for(const observer of observers)observer.emit(intersecting,ratio);drain();};
 drain();
 t.after(()=>{for(const cell of cells)(cell as {cleanup?:()=>void}|null)?.cleanup?.();Object.assign(globalThis,before);});
 return{requests,notify,settle,observeCalls:()=>observeCalls,activeObservers:()=>observers.filter(o=>o.connected),
  ids:()=>nodes(tree).filter(e=>e.type===Card).map(e=>(e.props.photo as {id:string}).id),
  button:()=>nodes(tree).find(e=>e.type==='button')!,
  respond:async(index:number,value:Page,status=200)=>{assert.ok(requests[index]);requests[index].resolve(Response.json(value,{status}));await settle();},
  fail:async(index:number)=>{requests[index].reject(new Error('network_fixture'));await settle();},
  update:async(next:Props)=>{props=next;dirty=true;await settle();},
 };
}

test('one persistent intersection fetches one page and does not reobserve after append',async t=>{
 const ui=harness(t);assert.equal(ui.observeCalls(),1);assert.equal(ui.requests.length,0);
 ui.notify(true);assert.equal(ui.requests.length,1);assert.equal(ui.button().props.disabled,true);
 await ui.respond(0,page(['next'],2));
 assert.deepEqual(ui.ids(),['initial','next']);assert.equal(ui.requests.length,1);assert.equal(ui.observeCalls(),1);assert.equal(ui.button().props.disabled,false);
 await ui.settle();assert.equal(ui.requests.length,1);
});

test('a real leave then reentry fetches the next cursor, including threshold-zero boundary entries',async t=>{
 const ui=harness(t);ui.notify(true,0);assert.equal(ui.requests.length,1);
 await ui.respond(0,page(['second'],2));ui.notify(false);ui.notify(true,0);
 assert.equal(ui.requests.length,2);assert.equal(new URL(ui.requests[1].url,'https://fixture.example').searchParams.get('cursor'),'2');
 await ui.respond(1,page(['third'],3));assert.equal(ui.requests.length,2);assert.equal(ui.observeCalls(),1);assert.deepEqual(ui.ids(),['initial','second','third']);
});

test('pending requests retain backpressure and an exhausted cursor disconnects the observer',async t=>{
 const ui=harness(t);ui.notify(true);ui.notify(false);ui.notify(true);assert.equal(ui.requests.length,1);
 await ui.respond(0,page(['last'],null));assert.equal(ui.activeObservers().length,0);assert.equal(ui.button(),undefined);
 ui.notify(false);ui.notify(true);assert.equal(ui.requests.length,1);assert.deepEqual(ui.ids(),['initial','last']);
});

test('failed requests stop automatic loads until explicit retry, which fetches exactly once',async t=>{
 const ui=harness(t);ui.notify(true);await ui.fail(0);
 assert.equal(ui.requests.length,1);assert.match(String(ui.button().props.children),/retry/);
 ui.notify(false);ui.notify(true);assert.equal(ui.requests.length,1);
 (ui.button().props.onClick as ()=>void)();await ui.settle();assert.equal(ui.requests.length,2);
 await ui.respond(1,page(['retried'],2));assert.equal(ui.requests.length,2);assert.deepEqual(ui.ids(),['initial','retried']);
 ui.notify(false);ui.notify(true);assert.equal(ui.requests.length,3);
});

test('a nonadvancing response preserves the cursor and explicit retry can finish normally',async t=>{
 const ui=harness(t);ui.notify(true);await ui.respond(0,page(['invalid'],1));
 assert.deepEqual(ui.ids(),['initial']);assert.match(String(ui.button().props.children),/retry/);assert.equal(ui.requests.length,1);
 (ui.button().props.onClick as ()=>void)();await ui.settle();await ui.respond(1,page(['valid'],null));
 assert.deepEqual(ui.ids(),['initial','valid']);assert.equal(ui.activeObservers().length,0);
});

test('query reset aborts an old request and loads only the new query without stale appends',async t=>{
 const ui=harness(t);ui.notify(true);assert.equal(ui.requests.length,1);
 await ui.update({initial:page(['new-initial'],10),params:{sort:'recent',q:'new-query'}});
 assert.equal(ui.requests[0].signal.aborted,true);assert.equal(ui.requests.length,2);
 const url=new URL(ui.requests[1].url,'https://fixture.example');assert.equal(url.searchParams.get('cursor'),'10');assert.equal(url.searchParams.get('q'),'new-query');
 await ui.respond(0,page(['stale'],2));assert.deepEqual(ui.ids(),['new-initial']);assert.equal(ui.button().props.disabled,true);
 await ui.respond(1,page(['new-next'],11));assert.deepEqual(ui.ids(),['new-initial','new-next']);assert.equal(ui.requests.length,2);
});

test('a query reset from the end restores one observer and requests its fresh cursor',async t=>{
 const ui=harness(t,page(['finished'],null));assert.equal(ui.activeObservers().length,0);
 ui.notify(true);await ui.update({initial:page(['fresh'],10),params:{sort:'recent',q:'fresh'}});
 assert.equal(ui.requests.length,1);await ui.respond(0,page(['new'],11));assert.equal(ui.requests.length,1);assert.equal(ui.activeObservers().length,1);
});
