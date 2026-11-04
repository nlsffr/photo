import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Options={placement:'interstitial'|'slider';spot:{zoneId:number;insClass:string};container:HTMLElement;permitted:()=>boolean;onStart:()=>void|boolean};
type Adapter={getExoclickGlobalSpot:(placement:string,device:string)=>Options['spot']|null;mountExoclickGlobalAd:(options:Options)=>()=>void};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function harness(t:TestContext){
 class Element extends EventTarget{tagName:string;children:Element[]=[];dataset:Record<string,string>={};className='';parentNode:Element|null=null;ownerDocument:unknown;src='';async=false;type='';root=false;hidden=false;
  constructor(tag:string){super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;}
  get isConnected():boolean{return this.root||Boolean(this.parentNode?.isConnected);}
  appendChild(child:Element){child.remove();child.parentNode=this;this.children.push(child);return child;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 }
 const calls:unknown[]=[],events:string[]=[];let permit=true;
 const view={AdProvider:undefined as unknown,setTimeout,clearTimeout};
 const doc:{head?:Element;body?:Element;defaultView:typeof view;createElement?:(tag:string)=>Element}={defaultView:view};doc.head=new Element('head');doc.body=new Element('body');doc.head.root=doc.body.root=true;doc.createElement=tag=>new Element(tag);
 const container=new Element('div');container.hidden=true;doc.body.appendChild(container);
 const api=loadAppModule<Adapter>('src/lib/exoclick-global.ts');
 const scripts=()=>doc.head!.children.filter(el=>el.tagName==='SCRIPT');
 const hosts=()=>doc.body!.children.filter(el=>el.dataset.lfhExoclickZone);
 const options=(placement:'interstitial'|'slider'='interstitial',device='desktop'):Options=>({placement,spot:api.getExoclickGlobalSpot(placement,device)!,container:container as unknown as HTMLElement,permitted:()=>permit,onStart:()=>{events.push('start');return true;}});
 const load=()=>{view.AdProvider={push(value:unknown){calls.push(value);events.push('serve');}};scripts()[0].dispatchEvent(new Event('load'));};
 // Every fixture completes or fails its synthetic script, so no real network or timer remains.
 t.after(()=>{for(const script of scripts())script.dispatchEvent(new Event('error'));});
 return{api,doc,view,container,calls,events,options,scripts,hosts,load,setPermit:(value:boolean)=>{permit=value;}};
}

test('registry contains only the three owned zones and their exact different generated classes',t=>{
 const ui=harness(t);
 assert.deepEqual(ui.api.getExoclickGlobalSpot('interstitial','desktop'),{zoneId:6074862,insClass:'eas6a97888e35'});
 assert.deepEqual(ui.api.getExoclickGlobalSpot('interstitial','mobile'),{zoneId:6074864,insClass:'eas6a97888e33'});
 for(const device of ['desktop','mobile'])assert.deepEqual(ui.api.getExoclickGlobalSpot('slider',device),{zoneId:6074866,insClass:'eas6a97888e17'});
 assert.equal(ui.api.getExoclickGlobalSpot('header','desktop'),null);assert.equal(ui.api.getExoclickGlobalSpot('slider','tablet'),null);
});
test('closed permission, disconnected sentinels, unowned IDs, mismatched classes and onStart refusal cause no SDK load',async t=>{
 for(const mode of ['permission','disconnected','zone','class','start'])await t.test(mode,async sub=>{
  const ui=harness(sub),options=ui.options();
  if(mode==='permission')ui.setPermit(false);if(mode==='disconnected')ui.container.remove();if(mode==='zone')options.spot={zoneId:123,insClass:'eas6a97888e35'};if(mode==='class')options.spot={zoneId:6074862,insClass:'eas6a97888e33'};if(mode==='start')options.onStart=()=>false;
  ui.api.mountExoclickGlobalAd(options);await flush();assert.equal(ui.scripts().length,0);assert.equal(ui.hosts().length,0);assert.equal(ui.calls.length,0);
 });
});
test('one generic PEM engine serves both formats only after load and a final permission check',async t=>{
 const ui=harness(t);ui.api.mountExoclickGlobalAd(ui.options());ui.api.mountExoclickGlobalAd(ui.options('slider'));
 assert.equal(ui.scripts().length,1);assert.equal(ui.scripts()[0].src,'https://a.pemsrv.com/ad-provider.js');assert.deepEqual(ui.events,['start','start']);assert.equal(ui.hosts().length,0);assert.equal(ui.calls.length,0);
 ui.load();await flush();assert.equal(ui.calls.length,2);assert.deepEqual(ui.calls,[{serve:{}},{serve:{}}]);assert.equal(ui.hosts().length,2);
 for(const host of ui.hosts()){assert.equal(host.parentNode,ui.doc.body);assert.equal(host.hidden,false);assert.equal(host.children.length,1);assert.equal(host.children[0].tagName,'INS');}
 assert.deepEqual(ui.hosts().map(h=>h.children[0].className),['eas6a97888e35','eas6a97888e17']);
});
test('revocation or disposal during script load never queues a late serve or creates a placeholder',async t=>{
 for(const mode of ['revoke','dispose','disconnect'])await t.test(mode,async sub=>{
  const ui=harness(sub),remove=ui.api.mountExoclickGlobalAd(ui.options());if(mode==='revoke')ui.setPermit(false);if(mode==='dispose')remove();if(mode==='disconnect')ui.container.remove();ui.load();await flush();assert.equal(ui.calls.length,0);assert.equal(ui.hosts().length,0);
 });
});
test('duplicates do not reload or rearm the same zone, even after its host is cleaned up',async t=>{
 const ui=harness(t),remove=ui.api.mountExoclickGlobalAd(ui.options());ui.api.mountExoclickGlobalAd(ui.options());assert.equal(ui.events.length,1);ui.load();await flush();assert.equal(ui.calls.length,1);const host=ui.hosts()[0];remove();remove();assert.equal(host.isConnected,false);ui.api.mountExoclickGlobalAd(ui.options());await flush();assert.equal(ui.calls.length,1);assert.equal(ui.scripts().length,1);assert.equal(ui.hosts().length,0);
});
test('SDK load failure stays failed for the page instead of retrying in an effect loop',async t=>{
 const ui=harness(t);ui.api.mountExoclickGlobalAd(ui.options());ui.scripts()[0].dispatchEvent(new Event('error'));await flush();ui.api.mountExoclickGlobalAd(ui.options());await flush();assert.equal(ui.scripts().length,0);assert.equal(ui.calls.length,0);assert.equal(ui.hosts().length,0);
});
test('a conflicting runtime or an SDK that never exposes its documented queue fails closed',async t=>{
 for(const mode of ['existing','missing'])await t.test(mode,async sub=>{
  const ui=harness(sub);if(mode==='existing')ui.view.AdProvider={push(){}};ui.api.mountExoclickGlobalAd(ui.options());if(mode==='missing')ui.scripts()[0].dispatchEvent(new Event('load'));await flush();assert.equal(ui.calls.length,0);assert.equal(ui.hosts().length,0);
 });
});
test('CSP additions are the exact official engine/API/close-icon origins, with no global HTTPS or eval relaxation',()=>{
 const {ADS_CSP}=loadAppModule<{ADS_CSP:Record<string,readonly string[]>}>('src/lib/ads-csp.ts');
 assert.ok(ADS_CSP.script.includes('https://a.pemsrv.com'));assert.ok(ADS_CSP.connect.includes('https://s.pemsrv.com'));assert.ok(ADS_CSP.image.includes('https://z6v2p9a8.bkcdn.net'));
 for(const values of Object.values(ADS_CSP))for(const value of values)assert.match(value,/^https:\/\/[a-z0-9.-]+$/);
 assert.equal(ADS_CSP.script.includes('https://a.magsrv.com'),false);
});


test('a disposed old load callback cannot release the ownership of a newer pending mount',async t=>{
 const ui=harness(t),remove=ui.api.mountExoclickGlobalAd(ui.options());remove();
 let probe=false,reentered=false;const second=ui.options();second.permitted=()=>{if(probe&&!reentered){reentered=true;ui.api.mountExoclickGlobalAd(ui.options());}return true;};
 ui.api.mountExoclickGlobalAd(second);probe=true;ui.load();await flush();assert.equal(ui.events.filter(v=>v==='start').length,2);assert.equal(ui.calls.length,1);assert.equal(ui.hosts().length,1);
});

test('the verified Sticky creative iframe origin is permitted only as a frame',()=>{
 const {ADS_CSP}=loadAppModule<{ADS_CSP:Record<string,readonly string[]>}>('src/lib/ads-csp.ts');
 assert.ok(ADS_CSP.frame.includes('https://go.marzaent.com'));
 for(const key of ['script','connect','image','media'])assert.equal(ADS_CSP[key].includes('https://go.marzaent.com'),false);
});
