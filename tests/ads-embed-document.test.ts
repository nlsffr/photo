import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
// @ts-expect-error Native Node requires explicit suffixes.
import {buildAdsEmbedDocument} from '../src/lib/ads-embed-document.ts';

test('the advertising HTTP document uses only registered code and hashes its fixed bootstrap',()=>{
  const result=buildAdsEmbedDocument('header','desktop');
  const boot=result.html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(boot);
  const hash=createHash('sha256').update(boot).digest('base64');
  assert.ok(result.csp.includes(`'sha256-${hash}'`));
  assert.match(result.csp,/frame-ancestors 'self'/);
  assert.match(result.csp,/img-src 'self' data: https:/);
  assert.match(result.html,/cdn\.fozekikikiminu\.com/);
  assert.match(result.html,/lfh_ad_consent=/);
  assert.doesNotMatch(result.html,/window\.open|document\.write|<[^>]+\sonload=/);
});
test('unrecognized embed parameters cannot become HTML or SDK input',()=>{
  for(const [placement,device] of [['<script>','desktop'],['header','mobile<script>'],['popunder','desktop']]) {
    assert.throws(()=>buildAdsEmbedDocument(placement as never,device as never));
  }
  assert.throws(()=>buildAdsEmbedDocument('header','mobile','injected<script>' as never));
});

test('embed profiles only add a public reporting category and keep the same publisher zones and consent guard',()=>{
  for(const profile of ['current','balanced','intensive'] as const){
    const result=buildAdsEmbedDocument('header','mobile',profile);
    assert.match(result.html,new RegExp(`"profile":"${profile}"`));
    assert.match(result.html,/ac23f7ff171648cf98eaede6374b9eb5/);
    assert.match(result.html,/lfh_ad_consent=/);assert.doesNotMatch(result.html,/unsafe-inline[^;]*script|document\.cookie\s*=/);
    const boot=result.html.match(/<script>([\s\S]*?)<\/script>/)![1];
    assert.ok(result.csp.includes(`'sha256-${createHash('sha256').update(boot).digest('base64')}'`));
  }
});

test('server bootstrap uses the same contextual 300x250 creator header format as the client',()=>{
  const page={kind:'creator',pathname:'/sample-v23/photos',collection:'photos'} as const;
  const result=buildAdsEmbedDocument('header','mobile','intensive',page);
  assert.match(result.html,/"placement":"header"/);
  assert.match(result.html,/8b7c10f34a5249bfaadd4a85fca7308e/);
  assert.doesNotMatch(result.html,/ac23f7ff171648cf98eaede6374b9eb5/);
  for(const profile of ['current','balanced'] as const)assert.match(buildAdsEmbedDocument('header','mobile',profile,page).html,/ac23f7ff171648cf98eaede6374b9eb5/);
});

test('the HTTP bootstrap does not load a SDK after consent is absent or revoked',async()=>{
  const {runInNewContext}=await import('node:vm');
  const script=buildAdsEmbedDocument('header','desktop').html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const created:unknown[]=[];const messages:unknown[]=[];
  runInNewContext(script,{document:{cookie:'lfh_audience=accepted',createElement:()=>{created.push({});}},parent:{postMessage:(value:unknown)=>messages.push(value)},location:{origin:'https://example.test'}});
  assert.equal(created.length,0);assert.equal(messages.length,1);
});

type ElementFixture = {
  tagName: string; complete?:boolean; naturalWidth?:number; naturalHeight?:number; readyState?:number;
  clientWidth:number; clientHeight:number; className:string; style:{backgroundImage?:string};
  dataset:Record<string,string>; src?:string; contentDocument?:ScopeFixture|null;
  children:ElementFixture[]; getAttribute:(name:string)=>string|null;
};
type ScopeFixture = {
  id?:string; children:ElementFixture[]; dispatch:(name:string)=>void;
  appendChild:(element:ElementFixture)=>void; querySelectorAll:(selector:string)=>ElementFixture[];
  querySelector:(selector:string)=>ElementFixture|null;
  addEventListener:(name:string,handler:()=>void,capture?:boolean)=>void;
  removeEventListener:(name:string,handler:()=>void,capture?:boolean)=>void;
};
function element(tagName:string, values:Partial<ElementFixture>={}):ElementFixture {
  const value:ElementFixture={tagName:tagName.toUpperCase(),clientWidth:300,clientHeight:250,className:'',style:{},dataset:{},children:[],
    getAttribute:name=>name==='src'?value.src??null:null,...values};
  return value;
}
function scope(children:ElementFixture[]=[]):ScopeFixture {
  const listeners=new Map<string,Set<()=>void>>();
  const all=()=>{const visit=(elements:ElementFixture[]):ElementFixture[]=>elements.flatMap(item=>[item,...visit(item.children)]);return visit(children);};
  const value:ScopeFixture={id:'lfh-ad',children,dispatch:name=>{listeners.get(name)?.forEach(handler=>handler());},appendChild:item=>{children.push(item);},
    querySelectorAll:selector=>all().filter(item=>selector.split(',').some(part=>part.trim()==='.mn-thumb__img'?item.className.split(' ').includes('mn-thumb__img'):item.tagName.toLowerCase()===part.trim())),
    querySelector:selector=>value.querySelectorAll(selector)[0]??null,
    addEventListener:(name,handler)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(handler);},
    removeEventListener:(name,handler)=>{listeners.get(name)?.delete(handler);}};
  return value;
}
function bootstrap(placement:'header'|'feed'='header', cookie='lfh_ad_consent=v2%3Aaccepted') {
  const root=scope();const messages:Array<{status:string}>=[];const scheduled:Array<{callback:()=>void;delay:number;cancelled:boolean}>=[];
  let observer=()=>{};let disconnected=false;
  const options:Array<Record<string,unknown>>=[];
  const document={cookie,getElementById:()=>root,createElement:(tag:string)=>element(tag)};
  const window={TSVideoShorts:(value:Record<string,unknown>)=>{options.push(value);root.children.push(element('video',{readyState:2}));},addEventListener:()=>{}};
  const result=buildAdsEmbedDocument(placement,'mobile');
  runInNewContext(result.html.match(/<script>([\s\S]*?)<\/script>/)![1],{
    document,location:{origin:'https://example.test'},parent:{postMessage:(value:{status:string})=>messages.push(value)},window,
    MutationObserver:class {constructor(callback:()=>void){observer=callback;}observe(){}disconnect(){disconnected=true;}},
    setTimeout:(callback:()=>void,delay:number)=>{scheduled.push({callback,delay,cancelled:false});return scheduled.length;},
    clearTimeout:(id:number)=>{if(scheduled[id-1])scheduled[id-1].cancelled=true;},
  });
  return {root,messages,document,options,mutate:()=>observer(),get disconnected(){return disconnected;},
    expire:()=>{const next=scheduled.find(item=>!item.cancelled);if(next){next.cancelled=true;next.callback();}}};
}

test('the feed document can use a local SDK mock with normal same-origin storage',()=>{
  const fixture=bootstrap('feed');
  const sdk=fixture.root.children[0] as ElementFixture & {onload?:()=>void};
  assert.equal(sdk.src,'https://cdn.tsyndicate.com/sdk/v1/video.shorts.js');
  sdk.onload?.();fixture.mutate();
  assert.equal(fixture.options.length,1);assert.equal(fixture.options[0].inFeed,true);assert.equal(fixture.options[0].autoXu,false);
  assert.equal(fixture.options[0].domain,undefined);assert.equal(fixture.messages[0].status,'filled');
});

test('a decoded image is retained after the previous eight-second removal deadline',()=>{
  const fixture=bootstrap();fixture.root.children.push(element('img',{src:'https://creative.test/banner.png',complete:true,naturalWidth:300,naturalHeight:250}));
  fixture.mutate();fixture.expire();
  assert.deepEqual(fixture.messages.map(value=>value.status),['filled']);
});

test('the SDK background is recognized only after its real image load handler assigns it',()=>{
  const fixture=bootstrap();const thumb=element('span',{className:'mn-thumb__img'});fixture.root.children.push(thumb);fixture.mutate();
  assert.equal(fixture.messages.length,0);
  // NativeAdPreview.Me sets this property only from its detached image's load handler.
  thumb.style.backgroundImage='url("https://creative.test/native.jpg")';fixture.mutate();fixture.expire();
  assert.deepEqual(fixture.messages.map(value=>value.status),['filled']);
});

test('pixels, unloaded images and decorative backgrounds are not reported filled',()=>{
  const fixture=bootstrap();fixture.root.children.push(
    element('img',{src:'https://creative.test/pixel.gif',complete:true,naturalWidth:1,naturalHeight:1}),
    element('img',{src:'https://creative.test/slow.png',complete:false,naturalWidth:0,naturalHeight:0}),
    element('span',{style:{backgroundImage:'url("https://creative.test/placeholder.jpg")'}}));
  fixture.mutate();assert.equal(fixture.messages.length,0);fixture.expire();
  assert.equal(fixture.messages.some(value=>value.status==='filled'),false);
  assert.equal(fixture.messages.some(value=>value.status==='empty'),false);
  const image=fixture.root.children.find(value=>value.src?.endsWith('/slow.png'))!;
  image.complete=true;image.naturalWidth=300;image.naturalHeight=250;fixture.root.dispatch('load');
  assert.equal(fixture.messages.at(-1)?.status,'filled');
});

test('an empty iframe is not fill proof but a loaded image in its same-origin document is',()=>{
  const fixture=bootstrap();const child=scope();fixture.root.children.push(element('iframe',{contentDocument:child}));
  fixture.mutate();assert.equal(fixture.messages.length,0);
  child.children.push(element('img',{src:'https://creative.test/inner.png',complete:true,naturalWidth:300,naturalHeight:250}));
  fixture.mutate();assert.equal(fixture.messages.at(-1)?.status,'filled');
});

test('an inaccessible cross-origin frame remains unverified rather than claimed filled',()=>{
  const fixture=bootstrap();const frame=element('iframe',{src:'https://creative.test/frame'});
  Object.defineProperty(frame,'contentDocument',{get(){throw new Error('cross-origin');}});fixture.root.children.push(frame);
  fixture.mutate();fixture.expire();
  assert.equal(fixture.messages.some(value=>value.status==='filled'),false);
  assert.equal(fixture.messages.some(value=>value.status==='empty'),false);
});

test('a truly empty slot expires without manufacturing fill and revoked consent stays closed',()=>{
  const fixture=bootstrap();fixture.expire();assert.deepEqual(fixture.messages.map(value=>value.status),['pending']);
  fixture.expire();assert.deepEqual(fixture.messages.map(value=>value.status),['pending','empty']);
  const revoked=bootstrap();revoked.root.children.push(element('img',{complete:true,naturalWidth:300,naturalHeight:250}));
  revoked.document.cookie='lfh_ad_consent=v2%3Arefused';revoked.mutate();
  assert.equal(revoked.messages.some(value=>value.status==='filled'),false);
});

test('a failed pending image eventually becomes empty and cannot fire a second terminal status',()=>{
  const fixture=bootstrap();const image=element('img',{src:'https://creative.test/broken.png',complete:false,naturalWidth:0,naturalHeight:0});
  fixture.root.children.push(image);fixture.expire();assert.equal(fixture.messages.at(-1)?.status,'pending');
  image.complete=true;fixture.root.dispatch('error');fixture.expire();
  assert.deepEqual(fixture.messages.map(value=>value.status),['pending','empty']);
  image.naturalWidth=300;image.naturalHeight=250;fixture.mutate();
  assert.deepEqual(fixture.messages.map(value=>value.status),['pending','empty']);assert.equal(fixture.disconnected,true);
});

test('same-origin child image load events are observed and a cross-origin frame never manufactures fill at the final budget',()=>{
  const fixture=bootstrap();const image=element('img',{src:'https://creative.test/inner.png',complete:false,naturalWidth:0,naturalHeight:0});
  const child=scope([image]);fixture.root.children.push(element('iframe',{contentDocument:child}));fixture.mutate();fixture.expire();
  image.complete=true;image.naturalWidth=300;image.naturalHeight=250;child.dispatch('load');
  assert.deepEqual(fixture.messages.map(value=>value.status),['pending','filled']);
  const unknown=bootstrap();unknown.root.children.push(element('iframe',{src:'https://creative.test/frame',contentDocument:null}));
  unknown.expire();unknown.expire();assert.deepEqual(unknown.messages.map(value=>value.status),['pending','pending']);
  assert.equal(unknown.disconnected,true);
});

test('a native thumbnail still loading in the SDK detached image is not removed after eight seconds',()=>{
  const fixture=bootstrap();const thumb=element('span',{className:'mn-thumb__img'});fixture.root.children.push(thumb);
  fixture.expire();assert.deepEqual(fixture.messages.map(value=>value.status),['pending']);
  thumb.style.backgroundImage='url("https://creative.test/slow-native.jpg")';fixture.mutate();
  assert.deepEqual(fixture.messages.map(value=>value.status),['pending','filled']);
});

test('an iframe navigation keeps its initial empty same-origin document pending',()=>{
  const fixture=bootstrap();const child=scope();fixture.root.children.push(element('iframe',{src:'https://creative.test/loading-frame',contentDocument:child}));
  fixture.expire();assert.deepEqual(fixture.messages.map(value=>value.status),['pending']);
  child.children.push(element('img',{src:'https://creative.test/inner.png',complete:true,naturalWidth:300,naturalHeight:250}));
  fixture.mutate();assert.deepEqual(fixture.messages.map(value=>value.status),['pending','filled']);
});

test('a slow SDK response with no creative DOM at eight seconds can still fill without reloading the SDK',()=>{
  const fixture=bootstrap();fixture.expire();assert.deepEqual(fixture.messages.map(value=>value.status),['pending']);
  fixture.root.children.push(element('img',{src:'https://creative.test/twelve-seconds.png',complete:true,naturalWidth:300,naturalHeight:250}));
  fixture.mutate();fixture.expire();assert.deepEqual(fixture.messages.map(value=>value.status),['pending','filled']);
  assert.equal(fixture.root.children.filter(value=>value.tagName==='SCRIPT').length,1);
});

test('a SDK network error closes immediately and never waits for or reloads an absent creative',()=>{
  const fixture=bootstrap();const sdk=fixture.root.children[0] as ElementFixture & {onerror?:()=>void};
  sdk.onerror?.();assert.deepEqual(fixture.messages.map(value=>value.status),['empty']);fixture.expire();
  assert.deepEqual(fixture.messages.map(value=>value.status),['empty']);
  assert.equal(fixture.root.children.filter(value=>value.tagName==='SCRIPT').length,1);
});
