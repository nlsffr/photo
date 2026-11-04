import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
// @ts-expect-error Native Node requires explicit suffixes.
import {buildExoclickVastDocument,createVastTools,type ExoclickVastOptions} from '../src/lib/exoclick-vast.ts';

type Tree={name:string;attrs:Record<string,string>;text:string;children:Tree[]};
const node=(name:string,children:Tree[]=[],text='',attrs:Record<string,string>={}):Tree=>({name,children,text,attrs});
function creative(skipoffset='00:00:05',duration='00:00:15'){
 return node('VAST',[node('Ad',[node('InLine',[
  node('Impression',[],'https://track.example.com/impression'),
  node('Creatives',[node('Creative',[node('Linear',[
   node('Duration',[],duration),node('MediaFiles',[node('MediaFile',[],'https://media.example.com/ad.mp4',{type:'video/mp4'})]),
   node('TrackingEvents',[node('Tracking',[],'https://track.example.com/complete',{event:'complete'}),node('Tracking',[],'https://track.example.com/skip',{event:'skip'})]),
  ],'',{skipoffset})])]),
 ])])],'',{version:'3.0'});
}
const config={kind:'linear',mode:'preroll',placement:'underVideo',tagUrl:'https://s.magsrv.com/v1/vast.php?idz=123',sourceHosts:['s.magsrv.com'],parentOrigin:'https://leakfanhub.com',nonce:'preroll-fixture',consentValue:'v2:accepted',labels:{advertisement:'Advertisement',close:'Close',skip:'Skip',visit:'Visit',play:'Play'}} as const;

test('the internal preroll mode is restricted to a linear underVideo document and never broadens scripts',()=>{
 const result=buildExoclickVastDocument(config);
 assert.match(result.csp,/script-src 'sha256-/);assert.doesNotMatch(result.csp,/unsafe-eval|script-src[^;]*unsafe-inline/);
 assert.match(result.html,/<meta name="color-scheme" content="dark">/);assert.match(result.html,/html\{color-scheme:dark\}/);
 for(const mode of ['preroll','postroll'] as const){
  assert.doesNotThrow(()=>buildExoclickVastDocument({...config,mode}));
  for(const override of [{mode:'unknown'},{mode:null},{kind:'nonlinear'},{placement:'feed'}])assert.throws(()=>buildExoclickVastDocument({...config,mode,...override} as ExoclickVastOptions));
 }
});

test('preroll respects a longer VAST skip threshold and a five-second minimum while legacy feed stays unchanged',()=>{
 const tools=createVastTools();
 for(const [offset,expected]of [['00:00:00',5],['00:00:03',5],['00:00:05',5],['00:00:10',10],['50%',7.5]] as const){
  for(const mode of ['preroll','postroll'] as const)assert.equal(tools.parseTree(creative(offset),'linear',mode).skipAfter,expected,mode+'/'+offset);
  assert.equal(tools.parseTree(creative(offset),'linear').skipAfter,Math.min(5,offset==='50%'?7.5:Number(offset.slice(-2))),`legacy/${offset}`);
 }
});

class ElementFixture extends EventTarget{
 tagName:string;children:ElementFixture[]=[];dataset:Record<string,string>={};attributesMap=new Map<string,string>();hidden=false;disabled=false;textContent='';type='';width=0;height=0;className='';rel='';target='';href='';referrerPolicy='';crossOrigin='';preload='';muted=false;playsInline=false;controls=false;paused=true;ended=false;seeking=false;readyState=0;currentTime=0;duration=15;naturalWidth=0;complete=false;playCalls=0;
 constructor(tag:string){super();this.tagName=tag.toUpperCase();}
 appendChild(e:ElementFixture){this.children.push(e);return e;}
 replaceChildren(){this.children=[];}
 setAttribute(k:string,v:string){this.attributesMap.set(k,v);}
 getAttribute(k:string){return this.attributesMap.get(k)??null;}
 removeAttribute(k:string){this.attributesMap.delete(k);}
 set src(value:string){this.setAttribute('src',value);}get src(){return this.getAttribute('src')??'';}
 load(){}
 pause(){if(!this.paused){this.paused=true;this.dispatchEvent(new Event('pause'));}}
 play(){this.playCalls++;this.paused=false;this.readyState=2;this.dispatchEvent(new Event('playing'));return Promise.resolve();}
 emit(name:string){this.dispatchEvent(new Event(name));}
 click(){if(!this.disabled)this.emit('click');}
}
function frameFixture({cookie='lfh_ad_consent=v2%3Aaccepted',mode='preroll' as 'preroll'|'postroll'|'legacy',tree=creative(),pending=false,playBlocked=false,fetchError=false}={}){
 let clock=0,timerId=0,resolveXml:((value:Response)=>void)|undefined;
 const timers=new Map<number,{at:number;fn:()=>void;interval:number}>();
 const schedule=(fn:()=>void,ms:number,interval=0)=>{const id=++timerId;timers.set(id,{at:clock+ms,fn,interval});return id;};
 const advance=(ms:number)=>{const end=clock+ms;let runs=0;for(;;){const due=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;if(++runs>500)throw Error('timer loop');clock=due[1].at;timers.delete(due[0]);if(due[1].interval)timers.set(due[0],{...due[1],at:clock+due[1].interval});due[1].fn();}clock=end;};
 const listeners=new Map<string,(e:unknown)=>void>();
 const root=new ElementFixture('section');root.hidden=true;
 const elements:ElementFixture[]=[],messages:Array<{type:string;placement:string;nonce:string;context?:string;status:string}>=[];
 const requests:Array<{url:string;signal?:AbortSignal}>=[];
 const parent={postMessage:(message:typeof messages[number])=>messages.push(message)};
 const document={cookie,hidden:false,getElementById:()=>root,createElement:(tag:string)=>{const e=new ElementFixture(tag);if(tag==='video'&&playBlocked)e.play=()=>Promise.reject(Error('autoplay blocked'));elements.push(e);return e;},addEventListener:(name:string,fn:(e:unknown)=>void)=>listeners.set('doc:'+name,fn),removeEventListener:(name:string)=>listeners.delete('doc:'+name)};
 const adapt=(n:Tree):unknown=>({localName:n.name,attributes:Object.entries(n.attrs).map(([name,value])=>({name,value})),textContent:n.text,children:n.children.map(adapt)});
 class DOMParserFixture{parseFromString(){return{documentElement:adapt(tree),getElementsByTagName:()=>[]};}}
 const preroll=mode!=='legacy';
 const current={...config,mode:preroll?mode:undefined,placement:preroll?'underVideo':'feed'};
 const script=buildExoclickVastDocument(current).html.match(/<script>([\s\S]*?)<\/script>/)![1];
 runInNewContext(script,{URL,AbortController,TextDecoder,Uint8Array,document,parent,DOMParser:DOMParserFixture,
  matchMedia:()=>({matches:false}),requestAnimationFrame:(fn:()=>void)=>fn(),
  setTimeout:(fn:()=>void,ms:number)=>schedule(fn,ms),clearTimeout:(id:number)=>timers.delete(id),setInterval:(fn:()=>void,ms:number)=>schedule(fn,ms,ms),clearInterval:(id:number)=>timers.delete(id),
  addEventListener:(name:string,fn:(e:unknown)=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name),
  fetch:(url:string,options:{signal?:AbortSignal})=>{requests.push({url,signal:options.signal});if(url===config.tagUrl&&fetchError)return Promise.reject(new TypeError('CORS denied'));if(url===config.tagUrl&&pending)return new Promise<Response>(resolve=>{resolveXml=resolve;});return Promise.resolve(new Response('<fixture/>'));},
 });
 const base={type:'lfh-ad-visibility',placement:current.placement,nonce:config.nonce,visible:true,...(preroll?{context:mode,activated:true}:{})};
 const message=(data:unknown=base,origin:string=config.parentOrigin,source:unknown=parent)=>listeners.get('message')?.({data,origin,source});
 const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
 return{root,elements,parent,document,requests,messages,listeners,timers,base,message,advance,settle,
  respond:()=>resolveXml?.(new Response('<fixture/>')),
  video:()=>elements.find(e=>e.tagName==='VIDEO')!,
  skip:()=>elements.find(e=>e.tagName==='BUTTON'&&e.textContent.startsWith(config.labels.skip))!,
  hide:()=>{document.hidden=true;listeners.get('doc:visibilitychange')?.({});},
  revoke:()=>{document.cookie='lfh_ad_consent=v2%3Arefused';advance(1000);},
  close:()=>listeners.get('pagehide')?.({}),
 };
}

test('the real serialized bootstrap requires explicit activation and exact parent context/source/origin before any request',async()=>{
 const ui=frameFixture();assert.equal(ui.requests.length,0);
 for(const data of [{...ui.base,activated:undefined},{...ui.base,activated:false},{...ui.base,activated:1},{...ui.base,context:undefined},{...ui.base,context:'pause'},{...ui.base,nonce:'wrong'},{...ui.base,visible:false}])ui.message(data);
 ui.message(ui.base,'https://evil.example.com');ui.message(ui.base,undefined,{});assert.equal(ui.requests.length,0);
 ui.message();await ui.settle();assert.equal(ui.requests.filter(r=>r.url===config.tagUrl).length,1);ui.message();await ui.settle();assert.equal(ui.requests.filter(r=>r.url===config.tagUrl).length,1);
 assert.equal(ui.messages.length,0);assert.equal(ui.video().muted,true);assert.equal(ui.video().playsInline,true);assert.equal(ui.video().controls,false);
 assert.equal(ui.elements.some(e=>e.dataset.close!==undefined),false);ui.close();
});

test('preroll counts played progress only, never metadata, loaded data, wall time, seek or paused events; skip is terminal once',async()=>{
 const ui=frameFixture();ui.message();await ui.settle();const video=ui.video(),skip=ui.skip();
 assert.equal(skip.textContent,'Skip (5)');
 video.emit('loadedmetadata');video.emit('loadeddata');assert.equal(ui.messages.length,0);assert.equal(skip.disabled,true);
 video.currentTime=10;video.seeking=true;video.emit('timeupdate');video.seeking=false;video.currentTime=0;video.emit('timeupdate');
 ui.advance(5000);assert.equal(skip.disabled,true);assert.equal(ui.messages.length,0);
 video.paused=true;video.currentTime=5;video.emit('timeupdate');assert.equal(ui.messages.length,0);
 video.paused=false;video.currentTime=0;video.emit('playing');
 for(let i=1;i<=4;i++){video.currentTime=i;video.emit('timeupdate');}
 assert.equal(skip.disabled,true);assert.equal(skip.textContent,'Skip (1)');assert.deepEqual(ui.messages.map(m=>m.status),['filled']);skip.click();assert.equal(ui.messages.length,1);
 video.currentTime=5;video.emit('timeupdate');assert.equal(skip.disabled,false);assert.equal(skip.textContent,'Skip');skip.click();skip.click();
 assert.deepEqual(ui.messages.map(m=>m.status),['filled','skipped']);assert.ok(ui.messages.every(m=>m.placement==='underVideo'&&m.nonce===config.nonce&&m.context==='preroll'));
 assert.equal(ui.requests.filter(r=>r.url.endsWith('/impression')).length,1);assert.equal(ui.requests.filter(r=>r.url.endsWith('/skip')).length,1);
 assert.equal(ui.listeners.size,0);assert.equal(ui.timers.size,0);
});

test('an autoplay rejection cannot produce an impression before a real playing event even if metadata or timeupdate arrives',async()=>{
 const ui=frameFixture({playBlocked:true});ui.message();await ui.settle();const video=ui.video();
 video.emit('loadeddata');video.paused=false;video.readyState=2;video.currentTime=1;video.emit('timeupdate');video.currentTime=2;video.emit('timeupdate');
 assert.equal(ui.messages.length,0);assert.equal(ui.requests.some(r=>r.url.endsWith('/impression')),false);assert.equal(ui.skip().disabled,true);
 video.emit('playing');video.currentTime=3;video.emit('timeupdate');assert.deepEqual(ui.messages.map(m=>m.status),['filled']);ui.close();
});

test('preroll never shortens a ten-second VAST skip and ends with a unique real-ended status',async()=>{
 const ui=frameFixture({tree:creative('00:00:10')});ui.message();await ui.settle();const video=ui.video(),skip=ui.skip();
 for(let i=1;i<=9;i++){video.currentTime=i;video.emit('timeupdate');}assert.equal(skip.disabled,true);
 video.currentTime=10;video.emit('timeupdate');assert.equal(skip.disabled,false);
 for(let i=11;i<=15;i++){video.currentTime=i;video.emit('timeupdate');}
 video.ended=true;video.emit('ended');video.emit('ended');assert.deepEqual(ui.messages.map(m=>m.status),['filled','ended']);
 assert.equal(ui.requests.filter(r=>r.url.endsWith('/complete')).length,1);assert.equal(ui.listeners.size,0);
});

test('a native pause at the natural end does not suppress the one genuine completion tracker',async()=>{
 const ui=frameFixture();ui.message();await ui.settle();const video=ui.video();
 for(let i=1;i<=15;i++){video.currentTime=i;video.emit('timeupdate');}
 video.ended=true;video.paused=true;video.emit('pause');video.emit('ended');
 assert.deepEqual(ui.messages.map(m=>m.status),['filled','ended']);assert.equal(ui.requests.filter(r=>r.url.endsWith('/complete')).length,1);
});

test('setup and active budgets fail open once without a fabricated complete event or a second XML request',async()=>{
 const pending=frameFixture({pending:true});pending.message();pending.advance(12000);assert.deepEqual(pending.messages.map(m=>m.status),['empty']);assert.equal(pending.requests[0].signal?.aborted,true);
 pending.respond();await pending.settle();assert.equal(pending.elements.length,0);assert.equal(pending.requests.length,1);
 const stalled=frameFixture();stalled.message();await stalled.settle();stalled.advance(12000);assert.deepEqual(stalled.messages.map(m=>m.status),['empty']);
 const playing=frameFixture();playing.message();await playing.settle();playing.video().currentTime=1;playing.video().emit('timeupdate');assert.deepEqual(playing.messages.map(m=>m.status),['filled']);
 playing.advance(125000);assert.deepEqual(playing.messages.map(m=>m.status),['filled','empty']);assert.equal(playing.requests.some(r=>r.url.endsWith('/complete')),false);assert.equal(playing.timers.size,0);
});

test('refusal, hidden document and parent visibility withdrawal stop preroll permanently without tracking a fake skip',async()=>{
 for(const operation of ['revoke','hide','parent-hide']as const){
  const ui=frameFixture();ui.message();await ui.settle();ui.video().currentTime=1;ui.video().emit('timeupdate');
  if(operation==='parent-hide')ui.message({...ui.base,visible:false});else ui[operation]();
  assert.deepEqual(ui.messages.map(m=>m.status),['filled','empty'],operation);ui.message();ui.advance(150000);
  assert.equal(ui.requests.filter(r=>r.url===config.tagUrl).length,1);assert.equal(ui.requests.some(r=>/\/(?:skip|complete)$/.test(r.url)),false);assert.equal(ui.listeners.size,0);
 }
 for(const cookie of ['', 'lfh_ad_consent=v1%3Aaccepted','lfh_ad_consent=v2%3Arefused']){
  const ui=frameFixture({cookie});ui.message();assert.equal(ui.requests.length,0);assert.deepEqual(ui.messages.map(m=>m.status),['empty']);
 }
 const hidden=frameFixture();hidden.document.hidden=true;hidden.message();assert.equal(hidden.requests.length,0);hidden.close();
});

test('empty or failed VAST releases the preroll and the unmodified feed still uses visibility alone plus its immediate close',async()=>{
 const empty=frameFixture({tree:node('VAST',[],'',{version:'3.0'})});empty.message();await empty.settle();assert.deepEqual(empty.messages.map(m=>m.status),['empty']);
 const failed=frameFixture();failed.message();await failed.settle();failed.video().emit('error');assert.deepEqual(failed.messages.map(m=>m.status),['empty']);
 const feed=frameFixture({mode:'legacy'});feed.message();await feed.settle();assert.equal(feed.requests.filter(r=>r.url===config.tagUrl).length,1);
 const close=feed.elements.find(e=>e.dataset.close!==undefined);assert.ok(close);assert.equal(feed.video().controls,true);close.click();assert.deepEqual(feed.messages.map(m=>m.status),['empty']);assert.equal(feed.messages[0].context,undefined);
 const zeroFeed=frameFixture({mode:'legacy',tree:creative('00:00:00')});zeroFeed.message();await zeroFeed.settle();assert.equal(zeroFeed.skip().disabled,true);
 zeroFeed.video().currentTime=1;zeroFeed.video().emit('timeupdate');assert.equal(zeroFeed.skip().disabled,false);zeroFeed.close();
});


test('postroll requires its own activated context and preserves real-progress skip, tracking and unique terminal semantics',async()=>{
 const ui=frameFixture({mode:'postroll',tree:creative('00:00:07')});
 assert.equal(ui.requests.length,0);
 for(const override of [{context:'preroll'},{context:undefined},{activated:undefined},{activated:false},{visible:false},{nonce:'other'}])ui.message({...ui.base,...override});
 ui.message(ui.base,'https://evil.example.com');ui.message(ui.base,undefined,{});assert.equal(ui.requests.length,0);
 ui.message();await ui.settle();assert.equal(ui.requests.filter(r=>r.url===config.tagUrl).length,1);
 assert.equal(ui.elements.some(e=>e.dataset.close!==undefined),false);assert.equal(ui.video().controls,false);
 const video=ui.video(),skip=ui.skip();
 ui.advance(5000);assert.equal(skip.disabled,true);assert.equal(ui.messages.length,0);
 for(let i=1;i<=6;i++){video.currentTime=i;video.emit('timeupdate');}
 assert.equal(skip.disabled,true);assert.equal(skip.textContent,'Skip (1)');
 video.currentTime=7;video.emit('timeupdate');assert.equal(skip.disabled,false);skip.click();skip.click();
 assert.deepEqual(ui.messages.map(m=>m.status),['filled','skipped']);assert.ok(ui.messages.every(m=>m.context==='postroll'));
 assert.equal(ui.requests.filter(r=>r.url.endsWith('/impression')).length,1);assert.equal(ui.requests.filter(r=>r.url.endsWith('/skip')).length,1);
 assert.equal(ui.listeners.size,0);assert.equal(ui.timers.size,0);
});

test('postroll empty, CORS failure, stalled setup, revocation and hiding fail open once without fabricated progress',async()=>{
 const empty=frameFixture({mode:'postroll',tree:node('VAST',[],'',{version:'3.0'})});empty.message();await empty.settle();
 assert.deepEqual(empty.messages.map(m=>m.status),['empty']);assert.equal(empty.messages[0].context,'postroll');
 const cors=frameFixture({mode:'postroll',fetchError:true});cors.message();await cors.settle();
 assert.deepEqual(cors.messages.map(m=>m.status),['empty']);assert.equal(cors.elements.length,0);assert.equal(cors.requests.length,1);
 const setup=frameFixture({mode:'postroll',pending:true});setup.message();setup.advance(12000);
 assert.deepEqual(setup.messages.map(m=>m.status),['empty']);assert.equal(setup.requests[0].signal?.aborted,true);
 setup.respond();await setup.settle();assert.equal(setup.elements.length,0);
 for(const operation of ['hide','revoke'] as const){
  const ui=frameFixture({mode:'postroll'});ui.message();await ui.settle();ui[operation]();ui.message();
  assert.deepEqual(ui.messages.map(m=>m.status),['empty']);assert.equal(ui.requests.filter(r=>r.url===config.tagUrl).length,1);
  assert.equal(ui.requests.some(r=>/\/(?:impression|skip|complete)$/.test(r.url)),false);assert.equal(ui.listeners.size,0);
 }
});


test('postroll publishes ended only at a genuine native end and never fabricates a second completion',async()=>{
 const ui=frameFixture({mode:'postroll'});ui.message();await ui.settle();const video=ui.video();
 for(let i=1;i<=15;i++){video.currentTime=i;video.emit('timeupdate');}
 video.ended=true;video.paused=true;video.emit('pause');video.emit('ended');video.emit('ended');
 assert.deepEqual(ui.messages.map(m=>m.status),['filled','ended']);assert.ok(ui.messages.every(m=>m.context==='postroll'));
 assert.equal(ui.requests.filter(r=>r.url.endsWith('/complete')).length,1);assert.equal(ui.listeners.size,0);
});
