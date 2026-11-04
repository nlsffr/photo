import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import React from 'react';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Node = React.ReactElement<Record<string,unknown>>;
const all=(value:unknown):Node[]=>Array.isArray(value)?value.flatMap(all):React.isValidElement(value)?[value as Node,...all((value.props as Record<string,unknown>).children)]:[];
const equal=(a:unknown[],b:unknown[])=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
type HarnessOptions={placement?:string;profile?:string;ordinal?:number;context?:string;allowed?:boolean;pathname?:string;layout?:'grid';mediation?:'standard'|'alternative'|null};
function harness(t:TestContext,{placement='footer',profile='current',ordinal=0,context='page',allowed=true,pathname,layout,mediation='standard'}:HarnessOptions={}) {
  let cursor=0,revision=4,permitted=allowed,currentProfile=profile,empties=0,observed:IntersectionObserverCallback|undefined;
  let width=150,resize:ResizeObserverCallback|undefined,currentMediation=mediation;
  const globalCalls:Array<{provider:string;placement:string;zoneId?:number;permitted:()=>boolean;removed:boolean}>=[];let sdkStarts=0;
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
  const before={window:globalThis.window,document:globalThis.document,location:globalThis.location,matchMedia:globalThis.matchMedia,IntersectionObserver:globalThis.IntersectionObserver,ResizeObserver:globalThis.ResizeObserver};
  Object.assign(globalThis,{window:windowMock,document:documentMock,location:{origin:'https://leakfanhub.com'},matchMedia:()=>media,
    IntersectionObserver:class{constructor(fn:IntersectionObserverCallback){observed=fn;}observe(){}disconnect(){}},
    ResizeObserver:class{constructor(fn:ResizeObserverCallback){resize=fn;}observe(){}disconnect(){resize=undefined;}}});
  const globalSpots={desktop:{zoneId:6074862,insClass:'eas6a97888e35'},mobile:{zoneId:6074864,insClass:'eas6a97888e33'},slider:{zoneId:6074866,insClass:'eas6a97888e17'}};
  const {AdSlot}=loadAppModule<{AdSlot:(p:unknown)=>Node}>('src/components/AdSlot.tsx',{
    react:hooks,'next/navigation':{usePathname:()=>pathname??(placement==='feed'?'/fr/feed':context==='pause'?'/fr/sample/123':'/fr/models')},'./LocaleProvider':{useLocale:()=>({locale:'fr'})},
    './AdsProvider':{useAds:()=>({runtime:{profile:currentProfile,revision},mediation:currentMediation,canServe:()=>permitted,markSdkStarted:()=>{sdkStarts++;}})},
    '@/lib/exoclick-registry':{getExoclickSpot:(p:string)=>['popunder','interstitial','slider'].includes(p)?null:({kind:p==='feed'?'linear':'banner',zoneId:123,width:300,height:250})},
    '@/lib/ads-sdk':{mountTrafficStarsAd:(o:{placement:string;permitted:()=>boolean;onStart:()=>void})=>{assert.ok(['popunder','interstitial','slider'].includes(o.placement));const call={provider:'trafficstars',placement:o.placement,permitted:o.permitted,removed:false};globalCalls.push(call);o.onStart();return()=>{call.removed=true;};}},
    '@/lib/exoclick-global':{getExoclickGlobalSpot:(p:string,d:string)=>p==='interstitial'?globalSpots[d==='desktop'?'desktop':'mobile']:p==='slider'?globalSpots.slider:null,
      mountExoclickGlobalAd:(o:{placement:string;spot:{zoneId:number};permitted:()=>boolean;onStart:()=>void})=>{const call={provider:'exoclick',placement:o.placement,zoneId:o.spot.zoneId,permitted:o.permitted,removed:false};globalCalls.push(call);o.onStart();return()=>{call.removed=true;};}},
  });
  const outer=AdSlot({placement,ordinal,context,layout,onEmpty:()=>{empties++;}}),Component=outer.type as (p:unknown)=>Node|null;
  let lastKey:string|null=null,element:HTMLIFrameElement|undefined;
  const container={getBoundingClientRect:()=>({width})} as HTMLElement;
  const render=()=>{cursor=0;const tree=Component(outer.props);const node=all(tree).find(n=>n.type==='iframe');
    const sentinel=all(tree).find(n=>n.type==='div'&&n.props.hidden&&n.props['data-ad-placement']);if(sentinel?.props.ref)(sentinel.props.ref as {current:unknown}).current=container;
    const aside=all(tree).find(n=>n.type==='aside');if(aside?.props.ref)(aside.props.ref as {current:unknown}).current=container;
    if(node){if(node.key!==lastKey){lastKey=node.key;element={contentWindow:{postMessage(data:unknown,origin:string){posted.push({target:element,data,origin});}}} as unknown as HTMLIFrameElement;}(node.props.ref as {current:unknown}).current=element;}
    const effects=pending;pending=[];effects.forEach(fn=>fn());return tree;};
  const frame=()=>{render();render();const node=all(render()).find(n=>n.type==='iframe');assert.ok(node);return{node,element:element!,url:new URL(String(node.props.src),'https://leakfanhub.com'),load:()=>(node.props.onLoad as (e:unknown)=>void)({currentTarget:element})};};
  const message=(data:unknown,source:unknown=element?.contentWindow,origin='https://leakfanhub.com')=>{const event=new Event('message');Object.assign(event,{data,source,origin});windowMock.dispatchEvent(event);};
  t.after(()=>{for(const cell of cells)(cell as {cleanup?:()=>void}|null)?.cleanup?.();Object.assign(globalThis,before);});
  return{render,frame,posted,message,media,document:documentMock,globalCalls,sdkStarts:()=>sdkStarts,empties:()=>empties,
    resize(next:number){width=next;if(resize)resize([],{} as ResizeObserver);else windowMock.dispatchEvent(new Event('resize'));},
    visible(ratio:number){observed?.([{target:element,isIntersecting:ratio>0,intersectionRatio:ratio}] as unknown as IntersectionObserverEntry[],{} as IntersectionObserver);},
    allow(value:boolean){permitted=value;},policy(value:string,next:number){currentProfile=value;revision=next;},
    mediation(value:'standard'|'alternative'|null){currentMediation=value;}};
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

test('intensive creator mobile header uses the existing 300x250 spot and an exact contextual TS path',t=>{
  const ui=harness(t,{placement:'header',profile:'intensive',pathname:'/fr/example_creator'}),frame=ui.frame();
  assert.equal(frame.url.pathname,'/api/ads/embed');assert.equal(frame.url.searchParams.get('path'),'/fr/example_creator');
  assert.deepEqual(frame.node.props.style,{width:300,height:250});
});

test('only intensive adds a TS path while legacy profiles keep their exact request payloads',async t=>{
  for(const profile of ['current','balanced']){
    await t.test(profile,sub=>{
      const ui=harness(sub,{placement:'header',profile,pathname:'/feedexample'}),frame=ui.frame();
      assert.equal(frame.url.search,'?placement=header&device=mobile');
      assert.deepEqual(frame.node.props.style,{width:300,height:100});
    });
  }
});

test('intensive grid scales the whole registered iframe, keeps its ratio, and updates on cell resize',t=>{
  const ui=harness(t,{placement:'underVideo',profile:'intensive',layout:'grid'}),frame=ui.frame();
  assert.equal(frame.node.props.className,'absolute left-0 top-0 block origin-top-left border-0');
  assert.deepEqual(frame.node.props.style,{width:300,height:250,transform:'scale(0.5)'});
  const box=all(ui.render()).find(n=>n.props['data-ad-grid-frame']!==undefined);assert.ok(box);
  assert.deepEqual(all(ui.render()).find(n=>n.type==='aside')?.props.style,{aspectRatio:'0.6'});
  assert.deepEqual(box.props.style,{maxWidth:300,aspectRatio:'300 / 250',overflow:'clip'});
  ui.resize(240);assert.deepEqual(ui.frame().node.props.style,{width:300,height:250,transform:'scale(0.8)'});
  ui.resize(360);assert.deepEqual(ui.frame().node.props.style,{width:300,height:250,transform:'scale(1)'});
  ui.allow(false);assert.equal(ui.render(),null);
});

test('grid measurement has a lightweight resize fallback and never requests a frame before measuring',t=>{
  const ui=harness(t,{placement:'underVideo',profile:'intensive',layout:'grid'});
  Object.assign(globalThis,{ResizeObserver:undefined});
  assert.equal(all(ui.render()).some(n=>n.type==='iframe'),false);
  assert.equal(all(ui.render()).some(n=>n.type==='iframe'),false);
  assert.deepEqual(ui.frame().node.props.style,{width:300,height:250,transform:'scale(0.5)'});
  ui.resize(210);assert.deepEqual(ui.frame().node.props.style,{width:300,height:250,transform:'scale(0.7)'});
});

test('intensive waits for mediation then sends only its resolved choice to the selected provider',t=>{
  const ui=harness(t,{placement:'feed',profile:'intensive',mediation:null});
  assert.equal(ui.render(),null);assert.equal(ui.render(),null);
  ui.mediation('standard');const ts=ui.frame();assert.equal(ts.url.pathname,'/api/ads/embed');
  assert.equal(ts.url.searchParams.get('mediation'),'standard');
  ui.mediation('alternative');const exo=ui.frame();assert.equal(exo.url.pathname,'/api/ads/exoclick');
  assert.equal(exo.url.searchParams.get('mediation'),'alternative');assert.notEqual(exo.node.key,ts.node.key);
  ui.policy('balanced',5);const legacy=ui.frame();assert.equal(legacy.url.searchParams.has('mediation'),false);
});

test('intensive desktop footer centers its existing creative in a bounded 860x280 wrapper',t=>{
  const ui=harness(t,{placement:'footer',profile:'intensive'});ui.frame();ui.media.matches=true;ui.media.dispatchEvent(new Event('change'));
  const tree=ui.render();const aside=all(tree).find(n=>n.type==='aside');assert.ok(aside);
  assert.deepEqual(aside.props.style,{width:'100%',maxWidth:860,minHeight:280});
  assert.deepEqual(ui.frame().node.props.style,{width:728,height:90});
});


test('intensive alternative globals mount only their owned Exo adapter, never an iframe or TrafficStars',async t=>{
  for(const placement of ['interstitial','slider'])await t.test(placement,sub=>{
    const ui=harness(sub,{placement,profile:'intensive',mediation:'alternative'});ui.render();const tree=ui.render();
    assert.equal(all(tree).some(n=>n.type==='iframe'),false);assert.equal(all(tree).find(n=>n.props.hidden)?.props['data-ad-placement'],placement);
    assert.deepEqual(ui.globalCalls.map(({provider,zoneId})=>({provider,zoneId})),[{provider:'exoclick',zoneId:placement==='interstitial'?6074864:6074866}]);
    assert.equal(ui.sdkStarts(),1);assert.equal(ui.globalCalls[0].permitted(),true);
    ui.allow(false);assert.equal(ui.render(),null);assert.equal(ui.globalCalls[0].removed,true);assert.equal(ui.globalCalls[0].permitted(),false);
  });
});

test('global mediation remains closed while unresolved and cleans the previous provider on a resolved change',t=>{
  const ui=harness(t,{placement:'interstitial',profile:'intensive',mediation:null});ui.render();assert.equal(ui.render(),null);assert.equal(ui.globalCalls.length,0);
  ui.mediation('alternative');ui.render();ui.render();assert.equal(ui.globalCalls[0].provider,'exoclick');
  ui.mediation('standard');ui.render();ui.render();assert.equal(ui.globalCalls[0].removed,true);assert.equal(ui.globalCalls[1].provider,'trafficstars');
  ui.mediation(null);assert.equal(ui.render(),null);assert.equal(ui.globalCalls[1].removed,true);assert.equal(ui.globalCalls.length,2);
});

test('owned Exo interstitial uses its desktop zone after a responsive change without mounting both SDKs',t=>{
  const ui=harness(t,{placement:'interstitial',profile:'intensive',mediation:'alternative'});ui.render();ui.render();
  ui.media.matches=true;ui.media.dispatchEvent(new Event('change'));ui.render();ui.render();
  assert.equal(ui.globalCalls[0].removed,true);assert.equal(ui.globalCalls.at(-1)?.zoneId,6074862);assert.equal(ui.globalCalls.every(call=>call.provider==='exoclick'),true);
});

test('legacy globals retain TrafficStars and never mount the Exo global adapter',async t=>{
  for(const profile of ['current','balanced'])await t.test(profile,sub=>{
    const ui=harness(sub,{placement:'interstitial',profile});ui.render();ui.render();
    assert.deepEqual(ui.globalCalls.map(call=>call.provider),['trafficstars']);
  });
});


test('ineligible global slots never load either SDK even after mediation is resolved',async t=>{
  for(const placement of ['interstitial','slider'])await t.test(placement,sub=>{
    const ui=harness(sub,{placement,profile:'intensive',mediation:'alternative',allowed:false});
    assert.equal(ui.render(),null);assert.equal(ui.render(),null);assert.equal(ui.globalCalls.length,0);assert.equal(ui.sdkStarts(),0);
  });
});


test('feed allocates the remaining column height to its block iframe without a viewport-height guess',t=>{
 const ui=harness(t,{placement:'feed',profile:'intensive'}),frame=ui.frame(),tree=ui.render();
 const aside=all(tree).find(n=>n.type==='aside')!,label=all(tree).find(n=>n.type==='p')!;
 assert.match(String(aside.props.className),/flex-col/);assert.match(String(aside.props.className),/min-h-0/);
 assert.match(String(label.props.className),/shrink-0/);assert.match(String(frame.node.props.className),/flex-1/);assert.match(String(frame.node.props.className),/min-h-0/);assert.match(String(frame.node.props.className),/block/);
 assert.deepEqual(frame.node.props.style,{width:'100%',height:0,minHeight:0});
});

test('intensive lower page slots reserve280px while their registered creative dimensions stay unchanged',async t=>{
 for(const placement of ['footer','underVideo'])await t.test(placement,sub=>{
  const ui=harness(sub,{placement,profile:'intensive'});const frame=ui.frame(),aside=all(ui.render()).find(n=>n.type==='aside')!;
  assert.equal((aside.props.style as {minHeight:number}).minHeight,280);assert.match(String(aside.props.className),/items-center/);
  assert.deepEqual(frame.node.props.style,{width:300,height:250});
 });
});

test('the intensive desktop header uses the bounded860px frame without changing its728x90 creative',t=>{
 const ui=harness(t,{placement:'header',profile:'intensive'});ui.frame();ui.media.matches=true;ui.media.dispatchEvent(new Event('change'));
 const aside=all(ui.render()).find(n=>n.type==='aside')!;assert.deepEqual(aside.props.style,{width:'100%',maxWidth:860});assert.deepEqual(ui.frame().node.props.style,{width:728,height:90});
});

test('page reserve never changes pause/grid or legacy banner wrappers',async t=>{
 await t.test('pause',sub=>{const ui=harness(sub,{placement:'underVideo',profile:'intensive',context:'pause'});ui.frame();assert.equal(all(ui.render()).find(n=>n.type==='aside')?.props.style,undefined);});
 for(const profile of ['current','balanced'])await t.test(profile,sub=>{const ui=harness(sub,{placement:'header',profile});ui.frame();assert.equal(all(ui.render()).find(n=>n.type==='aside')?.props.style,undefined);});
});


test('intensive mobile headers follow both owned100px and250px formats instead of an unrelated page reserve',async t=>{
 for(const [pathname,height]of [['/fr',100],['/fr/example_creator',250]] as const)await t.test(pathname,sub=>{
  const ui=harness(sub,{placement:'header',profile:'intensive',pathname}),frame=ui.frame(),aside=all(ui.render()).find(node=>node.type==='aside')!;
  assert.equal((aside.props.style as {minHeight?:number}|undefined)?.minHeight,undefined);assert.deepEqual(frame.node.props.style,{width:300,height});
 });
});

test('a confirmed empty header removes its label and wrapper without another provider',t=>{
 const ui=harness(t,{placement:'header',profile:'intensive',pathname:'/fr'});ui.frame();
 ui.message({type:'lfh-ad-status',placement:'header',status:'empty'});assert.equal(ui.render(),null);assert.equal(ui.empties(),1);
});
