import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import React from 'react';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Node = React.ReactElement<Record<string,unknown>>;
const all=(value:unknown):Node[]=>Array.isArray(value)?value.flatMap(all):React.isValidElement(value)?[value as Node,...all((value.props as Record<string,unknown>).children)]:[];
const equal=(a:unknown[],b:unknown[])=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
function harness(t:TestContext,{placement='footer',profile='current',ordinal=0,context='page',allowed=true}={}) {
  let cursor=0,revision=4,permitted=allowed,currentProfile=profile,empties=0,observed:IntersectionObserverCallback|undefined;
  const cells:unknown[]=[];let pending:Array<()=>void>=[];const posted:Array<{target:unknown;data:unknown;origin:string}>=[];
  const hooks={...React,useId:()=>'slot1',
    useState:(initial:unknown)=>{const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],(v:unknown)=>{cells[i]=typeof v==='function'?v(cells[i]):v;}];},
    useCallback:(callback:unknown,deps:unknown[])=>{const i=cursor++,old=cells[i] as {deps:unknown[];callback:unknown}|undefined;if(!old||!equal(old.deps,deps))cells[i]={deps,callback};return(cells[i] as {callback:unknown}).callback;},
    useRef:(initial:unknown)=>{const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
    useEffect:(fn:()=>void|(()=>void),deps:unknown[])=>{const i=cursor++,old=cells[i] as {deps:unknown[];cleanup?:()=>void}|undefined;if(!old||!equal(old.deps,deps)){const entry={deps,cleanup:undefined as (()=>void)|undefined};cells[i]=entry;pending.push(()=>{old?.cleanup?.();entry.cleanup=fn()||undefined;});}},
  };
  const documentMock=Object.assign(new EventTarget(),{hidden:false});
  const windowMock=Object.assign(new EventTarget(),{setTimeout,clearTimeout});
  const media=Object.assign(new EventTarget(),{matches:false});
  const before={window:globalThis.window,document:globalThis.document,location:globalThis.location,matchMedia:globalThis.matchMedia,IntersectionObserver:globalThis.IntersectionObserver};
  Object.assign(globalThis,{window:windowMock,document:documentMock,location:{origin:'https://leakfanhub.com'},matchMedia:()=>media,IntersectionObserver:class{constructor(fn:IntersectionObserverCallback){observed=fn;}observe(){}disconnect(){}}});
  const {AdSlot}=loadAppModule<{AdSlot:(p:unknown)=>Node}>('src/components/AdSlot.tsx',{
    react:hooks,'next/navigation':{usePathname:()=>placement==='feed'?'/fr/feed':context==='pause'?'/fr/sample/123':'/fr/models'},'./LocaleProvider':{useLocale:()=>({locale:'fr'})},
    './AdsProvider':{useAds:()=>({runtime:{profile:currentProfile,revision},canServe:()=>permitted,markSdkStarted:()=>{}})},
    '@/lib/exoclick-registry':{getExoclickSpot:(p:string)=>({kind:p==='feed'?'linear':'banner',zoneId:123,width:300,height:250})},
    '@/lib/ads-sdk':{mountTrafficStarsAd:()=>{throw new Error('Inline slots cannot mount global SDKs.');}},
  });
  const outer=AdSlot({placement,ordinal,context,onEmpty:()=>{empties++;}}),Component=outer.type as (p:unknown)=>Node|null;
  let lastKey:string|null=null,element:HTMLIFrameElement|undefined;
  const render=()=>{cursor=0;const tree=Component(outer.props);const node=all(tree).find(n=>n.type==='iframe');
    if(node){if(node.key!==lastKey){lastKey=node.key;element={contentWindow:{postMessage(data:unknown,origin:string){posted.push({target:element,data,origin});}}} as unknown as HTMLIFrameElement;}(node.props.ref as {current:unknown}).current=element;}
    const effects=pending;pending=[];effects.forEach(fn=>fn());return tree;};
  const frame=()=>{render();const node=all(render()).find(n=>n.type==='iframe');assert.ok(node);return{node,element:element!,url:new URL(String(node.props.src),'https://leakfanhub.com'),load:()=>(node.props.onLoad as (e:unknown)=>void)({currentTarget:element})};};
  const message=(data:unknown,source:unknown=element?.contentWindow,origin='https://leakfanhub.com')=>{const event=new Event('message');Object.assign(event,{data,source,origin});windowMock.dispatchEvent(event);};
  t.after(()=>{for(const cell of cells)(cell as {cleanup?:()=>void}|null)?.cleanup?.();Object.assign(globalThis,before);});
  return{render,frame,posted,message,media,document:documentMock,empties:()=>empties,
    visible(ratio:number){observed?.([{target:element,isIntersecting:ratio>0,intersectionRatio:ratio}] as unknown as IntersectionObserverEntry[],{} as IntersectionObserver);},
    allow(value:boolean){permitted=value;},policy(value:string,next:number){currentProfile=value;revision=next;}};
}

test('Exo footer uses only the private registry endpoint, with its exact profile/context/path/locale and correlation nonce',t=>{
  const ui=harness(t),{url}=ui.frame();assert.equal(url.pathname,'/api/ads/exoclick');
  assert.deepEqual([...url.searchParams.keys()].sort(),['context','device','locale','nonce','path','placement','profile']);
  assert.equal(url.searchParams.get('profile'),'current');assert.equal(url.searchParams.get('context'),'page');assert.equal(url.searchParams.get('path'),'/fr/models');assert.equal(url.searchParams.get('locale'),'fr');
  assert.match(url.searchParams.get('nonce')!,/^[A-Za-z0-9_-]{1,100}$/);assert.doesNotMatch(url.href,/zone|tagUrl/);
});

test('visibility requires at least half the current frame, a visible document and a still-eligible runtime',t=>{
  const ui=harness(t),frame=ui.frame();frame.load();assert.ok(ui.posted.length);assert.equal((ui.posted.at(-1)!.data as {visible:boolean}).visible,false);
  ui.visible(.49);assert.equal((ui.posted.at(-1)!.data as {visible:boolean}).visible,false);ui.visible(.5);assert.equal((ui.posted.at(-1)!.data as {visible:boolean}).visible,true);
  const data=ui.posted.at(-1)!.data as Record<string,unknown>;assert.equal(data.type,'lfh-ad-visibility');assert.equal(data.nonce,frame.url.searchParams.get('nonce'));assert.equal(ui.posted.at(-1)!.origin,'https://leakfanhub.com');
  ui.document.hidden=true;ui.document.dispatchEvent(new Event('visibilitychange'));assert.equal((ui.posted.at(-1)!.data as {visible:boolean}).visible,false);
  ui.document.hidden=false;ui.allow(false);ui.document.dispatchEvent(new Event('visibilitychange'));assert.equal((ui.posted.at(-1)!.data as {visible:boolean}).visible,false);assert.equal(ui.render(),null);
});

test('status validates nonce, origin and current frame; a confirmed empty removes the slot once without requesting a second provider',t=>{
  const ui=harness(t),frame=ui.frame(),base={type:'lfh-ad-status',placement:'footer',nonce:frame.url.searchParams.get('nonce'),status:'empty'};
  ui.message({...base,nonce:'wrong'});ui.message(base,{});ui.message(base,frame.element.contentWindow,'https://evil.test');assert.equal(ui.empties(),0);
  ui.message(base);ui.message(base);assert.equal(ui.empties(),1);assert.equal(ui.render(),null);
});

test('profile/revision and responsive device changes replace the frame and reject prior frame signals',t=>{
  const ui=harness(t),first=ui.frame();ui.policy('balanced',5);const second=ui.frame();assert.notEqual(first.node.key,second.node.key);assert.notEqual(first.url.searchParams.get('nonce'),second.url.searchParams.get('nonce'));
  ui.message({type:'lfh-ad-status',placement:'footer',nonce:first.url.searchParams.get('nonce'),status:'empty'},first.element.contentWindow);assert.equal(ui.empties(),0);
  ui.media.matches=true;ui.media.dispatchEvent(new Event('change'));const desktop=ui.frame();assert.equal(desktop.url.searchParams.get('device'),'desktop');assert.notEqual(desktop.node.key,second.node.key);
});

test('feed passes a stable ordinal and chooses exactly one provider according to the saved profile',t=>{
  const ui=harness(t,{placement:'feed',profile:'balanced',ordinal:1}),frame=ui.frame();assert.equal(frame.url.pathname,'/api/ads/exoclick');assert.equal(frame.url.searchParams.get('ordinal'),'1');assert.equal(frame.url.searchParams.get('path'),'/fr/feed');
  ui.policy('current',5);const ts=ui.frame();assert.equal(ts.url.pathname,'/api/ads/embed');assert.equal(ts.url.searchParams.get('ordinal'),'1');
});

test('all runtime exclusions leave no iframe and create no parent-side advertising requests',async t=>{
  for(const reason of ['OFF','owner','Premium','consent','stale'])await t.test(reason,sub=>{const ui=harness(sub,{allowed:false});assert.equal(ui.render(),null);assert.equal(ui.posted.length,0);});
});


test('a genuine pause slot selects the NonLinear context on its media page, with its registered 300x250 frame',t=>{
  const ui=harness(t,{placement:'underVideo',profile:'intensive',context:'pause'}),frame=ui.frame();
  assert.equal(frame.url.pathname,'/api/ads/exoclick');assert.equal(frame.url.searchParams.get('context'),'pause');
  assert.equal(frame.url.searchParams.get('path'),'/fr/sample/123');assert.equal(frame.url.searchParams.has('ordinal'),false);
  assert.deepEqual(frame.node.props.style,{width:300,height:250});
});
