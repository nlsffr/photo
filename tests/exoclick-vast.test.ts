import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
// @ts-expect-error Native Node requires explicit suffixes.
import {createVastTools,buildExoclickVastDocument} from '../src/lib/exoclick-vast.ts';

type XmlNode={name:string;children:XmlNode[];text:string;attrs:Record<string,string>};
const node=(name:string,children:XmlNode[]=[],text='',attrs:Record<string,string>={}):XmlNode=>({name,children,text,attrs});
const track=(url:string,event='start')=>node('Tracking',[],url,{event});
const root=(body:XmlNode)=>node('VAST',[node('Ad',[body])],'',{version:'3.0'});
const linear=()=>root(node('InLine',[
  node('Impression',[],'https://track.example.com/imp'),
  node('Creatives',[node('Creative',[node('Linear',[
    node('Duration',[],'00:00:08'),node('MediaFiles',[node('MediaFile',[],'https://static.exoclick.rocks/ad.mp4',{type:'video/mp4'})]),
    node('TrackingEvents',[track('https://track.example.com/start'),track('https://track.example.com/q1','firstQuartile')]),
    node('VideoClicks',[node('ClickThrough',[],'https://advertiser.example.com/')]),
  ],'',{skipoffset:'00:00:05'})])]),
]));
const wrapper=(uri:string)=>root(node('Wrapper',[node('Impression',[],'https://track.example.com/wimp'),node('VASTAdTagURI',[],uri)]));
const tools=createVastTools();

test('URLs allow only public HTTPS DNS names, never credentials, private literals or local suffixes',()=>{
  assert.equal(tools.publicUrl('https://s.magsrv.com/v1/vast.php?idz=123'), 'https://s.magsrv.com/v1/vast.php?idz=123');
  for(const value of ['javascript:alert(1)','http://ads.example.com/','https://user:secret@ads.example.com/','https://127.0.0.1/','https://2130706433/','https://[::1]/','https://192.168.1.1/','https://10.0.0.1/','https://localhost/','https://x.local/','https://x.internal/','https://ads.example.com:8443/','//ads.example.com/','https://ads.example.com./'])assert.equal(tools.publicUrl(value),null,value);
});
test('native XML boundary rejects oversized, entity and malformed documents before interpreting ads',()=>{
  let called=0;const parse=()=>{called++;return {documentElement:null,getElementsByTagName:()=>[]} as unknown as Document;};
  for(const xml of ['<!DOCTYPE VAST [<!ENTITY x SYSTEM "https://x.example.com">]><VAST/>','<!ENTITY x "bad">','x'.repeat(262145)])assert.throws(()=>tools.parseXml(xml,'linear',{parseFromString:parse}));
  assert.equal(called,0);assert.throws(()=>tools.parseXml('<broken>','linear',{parseFromString:parse}));
});
test('VAST semantics select safe linear media, exact duration and skip without parsing HTML as markup',()=>{
  const ad=tools.parseTree(linear(),'linear');assert.equal(ad.resource,'https://static.exoclick.rocks/ad.mp4');assert.equal(ad.duration,8);assert.equal(ad.skipAfter,5);
  assert.equal(ad.clickThrough,'https://advertiser.example.com/');assert.deepEqual(ad.impressions,['https://track.example.com/imp']);
  assert.deepEqual(ad.events.start,['https://track.example.com/start']);
  const invalid=linear();invalid.attrs.version='2.0';assert.throws(()=>tools.parseTree(invalid,'linear'));
  assert.throws(()=>tools.parseTree(linear(),'nonlinear'));
});
test('nonlinear supports only300x250 image data, rejecting HTML/SVG resources and unsafe clicks',()=>{
  const build=(type:string,url:string)=>root(node('InLine',[node('Impression',[],'https://track.example.com/nl'),node('Creatives',[node('Creative',[node('NonLinearAds',[node('NonLinear',[node('StaticResource',[],url,{creativeType:type}),node('NonLinearClickThrough',[],'javascript:alert(1)')],'',{width:'300',height:'250'})])])])]));
  const ad=tools.parseTree(build('image/png','https://static.exoclick.rocks/ad.png'),'nonlinear');assert.equal(ad.resource,'https://static.exoclick.rocks/ad.png');assert.equal(ad.clickThrough,null);
  for(const [mime,url] of [['text/html','https://x.example.com/a'],['image/svg+xml','https://x.example.com/a.svg'],['image/png','https://127.0.0.1/a.png']])assert.throws(()=>tools.parseTree(build(mime,url),'nonlinear'));
});
test('a nonlinear creative never borrows tracking events from a neighboring linear creative',()=>{
  const fixture=linear();const body=fixture.children[0].children[0];
  body.children.find(n=>n.name==='Creatives')!.children.push(node('Creative',[node('NonLinearAds',[
    node('TrackingEvents',[track('https://track.example.com/image','creativeView')]),
    node('NonLinear',[node('StaticResource',[],'https://static.exoclick.rocks/a.png',{creativeType:'image/png'})],'',{width:'300',height:'250'}),
  ])]));
  const ad=tools.parseTree(fixture,'nonlinear');assert.deepEqual(ad.events,{creativeView:['https://track.example.com/image']});
});
test('wrappers aggregate tracking once and reject cycles, excessive depth and aborts',async()=>{
  const a='https://s.magsrv.com/a',b='https://s.magsrv.com/b',controller=new AbortController(),calls:string[]=[];
  const docs=new Map([[a,wrapper(b)],[b,linear()]]);
  const resolve=(url:string)=>tools.resolve(url,'linear',{signal:controller.signal,fetchText:async u=>{calls.push(u);return u;},parse:xml=>tools.parseTree(docs.get(xml)!,'linear')});
  const ad=await resolve(a);assert.deepEqual(calls,[a,b]);assert.deepEqual(ad.impressions,['https://track.example.com/wimp','https://track.example.com/imp']);
  docs.set(b,wrapper(a));await assert.rejects(resolve(a),/vast_wrapper/);
  docs.set(b,wrapper('https://s.magsrv.com/c'));docs.set('https://s.magsrv.com/c',wrapper('https://s.magsrv.com/d'));docs.set('https://s.magsrv.com/d',wrapper('https://s.magsrv.com/e'));await assert.rejects(resolve(a),/vast_wrapper/);
  controller.abort();const before=calls.length;await assert.rejects(resolve(a),/vast_abort/);assert.equal(calls.length,before);
});
test('late wrapper responses after cancellation cannot continue to another URL',async()=>{
  const controller=new AbortController();let done!:(s:string)=>void,calls=0;
  const pending=tools.resolve('https://s.magsrv.com/a','linear',{signal:controller.signal,fetchText:async()=>{calls++;return new Promise(r=>{done=r;});},parse:()=>tools.parseTree(wrapper('https://s.magsrv.com/b'),'linear')});
  controller.abort();done('fixture');await assert.rejects(pending,/vast_abort/);assert.equal(calls,1);
});
test('tracking requires visible real progress; quartiles and impressions cannot repeat or be manufactured by seeks',()=>{
  const ad=tools.parseTree(linear(),'linear'),sent:string[]=[];ad.events.midpoint=['https://track.example.com/q2'];ad.events.complete=['https://track.example.com/end'];
  const state=tools.createTracker(ad,url=>sent.push(url));state.progress(1,8,false);assert.equal(sent.length,0);
  state.setActive(true);state.progress(0,8,false);assert.equal(sent.length,0);state.progress(6,8,true);assert.equal(sent.length,0);
  state.progress(0,8,false);for(let i=1;i<=8;i++){state.progress(i,8,false);state.progress(i,8,false);}state.complete();state.complete();
  assert.equal(sent.filter(u=>u.endsWith('/imp')).length,1);assert.equal(sent.filter(u=>u.endsWith('/start')).length,1);assert.equal(sent.filter(u=>u.endsWith('/q1')).length,1);assert.equal(sent.filter(u=>u.endsWith('/q2')).length,1);assert.equal(sent.filter(u=>u.endsWith('/end')).length,1);
});
test('nonlinear impression needs both image readiness and visibility; closing forbids later tracking',()=>{
  const ad={kind:'nonlinear',impressions:['https://track.example.com/imp'],events:{creativeView:['https://track.example.com/view']},clickTracking:[],errors:[]};
  const sent:string[]=[],state=tools.createTracker(ad as never,u=>sent.push(u));state.imageReady();assert.equal(sent.length,0);state.setActive(true);state.imageReady();state.imageReady();assert.equal(sent.length,2);state.close('close');state.imageReady();state.event('creativeView');assert.equal(sent.length,2);
});
test('teardown without an explicit close or skip never manufactures a user-close tracker',()=>{
 const ad={...tools.parseTree(linear(),'linear'),events:{closeLinear:['https://track.example.com/close'],skip:['https://track.example.com/skip']}};
 const sent:string[]=[],state=tools.createTracker(ad,u=>sent.push(u));state.setActive(true);state.progress(0,8,false);state.progress(1,8,false);state.close('');
 assert.doesNotMatch(sent.join(','),/\/close|\/skip/);state.close('closeLinear');assert.doesNotMatch(sent.join(','),/\/close|\/skip/);
});
test('generated document validates internal endpoint config, escapes data and authorizes only fixed code',()=>{
  const config={kind:'linear' as const,placement:'feed',tagUrl:'https://s.magsrv.com/v1/vast.php?idz=123',sourceHosts:['s.magsrv.com'],parentOrigin:'https://leakfanhub.com',nonce:'test-frame-1',consentValue:'v2:accepted' as const,labels:{advertisement:'Ad',close:'Close',skip:'Skip',visit:'Visit',play:'Play'}};
  const result=buildExoclickVastDocument({...config,labels:{...config.labels,close:'</script><script>alert(1)</script>'}}),boot=result.html.match(/<script>([\s\S]*?)<\/script>/)![1];
  assert.ok(result.csp.includes(`'sha256-${createHash('sha256').update(boot).digest('base64')}'`));assert.doesNotMatch(boot,/<\/script>/);assert.match(result.csp,/frame-ancestors 'self'/);assert.doesNotMatch(result.csp,/script-src[^;]*unsafe-inline/);assert.doesNotMatch(result.html,/document\.write|innerHTML|eval\(/);
  assert.match(boot,/lfh-ad-visibility/);assert.match(boot,/v2:accepted/);assert.match(boot,/credentials:\s*["']omit["']/);
  assert.throws(()=>buildExoclickVastDocument({...config,tagUrl:'https://evil.example.com/vast'}));assert.throws(()=>buildExoclickVastDocument({...config,consentValue:'v1:accepted' as never}));
  for(const nonce of [undefined,123,'','<script>','a'.repeat(101)])assert.throws(()=>buildExoclickVastDocument({...config,nonce:nonce as never}));
  for(const parentOrigin of ['https://leakfanhub.com','http://127.0.0.1:3029','http://localhost:3029'])assert.doesNotThrow(()=>buildExoclickVastDocument({...config,parentOrigin}));
  for(const parentOrigin of ['https://evil.example.com','http://192.168.1.1','https://leakfanhub.com/path','https://leakfanhub.com:8443','http://127.0.0.1.evil.example.com'])assert.throws(()=>buildExoclickVastDocument({...config,parentOrigin}));
});

function frameFixture(cookie:string){
 const config={kind:'linear' as const,placement:'feed',tagUrl:'https://s.magsrv.com/v1/vast.php?idz=123',sourceHosts:['s.magsrv.com'],parentOrigin:'https://leakfanhub.com',nonce:'test-frame-1',consentValue:'v2:accepted' as const,labels:{advertisement:'Ad',close:'Close',skip:'Skip',visit:'Visit',play:'Play'}};
 const script=buildExoclickVastDocument(config).html.match(/<script>([\s\S]*?)<\/script>/)![1];
 const listeners=new Map<string,(event:unknown)=>void>(),messages:unknown[]=[],requests:Array<{url:string;signal:AbortSignal}>=[];
 let finish!:(response:Response)=>void;const root={hidden:true,replaceChildren(){}};
 const parent={postMessage:(value:unknown)=>messages.push(value)};
 const document={cookie,hidden:false,getElementById:()=>root,addEventListener:(name:string,fn:(e:unknown)=>void)=>listeners.set('doc:'+name,fn),removeEventListener:(name:string)=>listeners.delete('doc:'+name)};
 runInNewContext(script,{URL,AbortController,TextDecoder,Uint8Array,document,parent,
  addEventListener:(name:string,fn:(e:unknown)=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name),
  setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},
  fetch:(url:string,options:{signal:AbortSignal})=>{requests.push({url,signal:options.signal});return new Promise(resolve=>{finish=resolve;});},
 });
 return {parent,document,requests,messages,listeners,respond:(response:Response)=>finish(response),
  message:(value:unknown,origin=config.parentOrigin,source:unknown=parent)=>listeners.get('message')?.({origin,source,data:value}),
  close:()=>listeners.get('pagehide')?.({}),
 };
}
test('the frame waits for v2 consent AND an exact trusted visibility message, aborting hidden XML and stale responses',async()=>{
 const ui=frameFixture('lfh_ad_consent=v2%3Aaccepted');assert.equal(ui.requests.length,0);
 const visible={type:'lfh-ad-visibility',placement:'feed',nonce:'test-frame-1',visible:true};
 ui.message(visible,'https://evil.example.com');ui.message(visible,undefined,{});ui.message({...visible,placement:'underVideo'});ui.message({...visible,visible:1});ui.message({...visible,nonce:'wrong'});assert.equal(ui.requests.length,0);
 ui.message(visible);assert.equal(ui.requests.length,1);ui.message(visible);assert.equal(ui.requests.length,1);
 ui.message({...visible,visible:false});assert.equal(ui.requests[0].signal.aborted,true);
 ui.respond(new Response('<VAST version="3.0"/>'));await new Promise(resolve=>setImmediate(resolve));assert.equal(ui.requests.length,1);assert.equal(ui.messages.length,0);
 ui.close();assert.equal(ui.listeners.size,0);
});
test('old or absent consent cannot load XML; revoking consent after a valid parent message cancels requests',()=>{
 for(const cookie of ['', 'lfh_ad_consent=v1%3Aaccepted','lfh_ad_consent=v2%3Arefused']){
  const ui=frameFixture(cookie);ui.message({type:'lfh-ad-visibility',placement:'feed',nonce:'test-frame-1',visible:true});assert.equal(ui.requests.length,0);assert.equal(ui.messages.length,1);assert.equal(ui.listeners.size,0);
 }
 const ui=frameFixture('lfh_ad_consent=v2%3Aaccepted');ui.message({type:'lfh-ad-visibility',placement:'feed',nonce:'test-frame-1',visible:true});
 ui.document.cookie='lfh_ad_consent=v2%3Arefused';ui.listeners.get('doc:visibilitychange')?.({});assert.equal(ui.requests[0].signal.aborted,true);assert.equal(ui.listeners.size,0);
});
