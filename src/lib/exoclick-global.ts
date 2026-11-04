import type {AdPlacement} from './ads-contract';
import type {AdDevice} from './ads-registry';

export const EXOCLICK_GLOBAL_SCRIPT = 'https://a.pemsrv.com/ad-provider.js';
export type ExoclickGlobalSpot = Readonly<{zoneId:number;insClass:string}>;
const DESKTOP_INTERSTITIAL = Object.freeze({zoneId:6074862,insClass:'eas6a97888e35'});
const MOBILE_INTERSTITIAL = Object.freeze({zoneId:6074864,insClass:'eas6a97888e33'});
const STICKY = Object.freeze({zoneId:6074866,insClass:'eas6a97888e17'});

export function getExoclickGlobalSpot(placement:AdPlacement,device:AdDevice):ExoclickGlobalSpot|null {
  if (!['desktop','mobile'].includes(device)) return null;
  if (placement==='interstitial') return device==='desktop'?DESKTOP_INTERSTITIAL:MOBILE_INTERSTITIAL;
  return placement==='slider'?STICKY:null;
}

type Serve = {serve:Record<string,never>};
type Provider = {push:(command:Serve)=>unknown};
type VendorWindow = Window & {AdProvider?:Serve[]|Provider|null};
type Runtime = {script?:Promise<void>;active:Map<number,object>;served:Set<number>};
const runtimes = new WeakMap<Document,Runtime>();
function runtime(document:Document):Runtime {
  let state=runtimes.get(document);
  if (!state) {state={active:new Map(),served:new Set()};runtimes.set(document,state);}
  return state;
}

/** The generic PEM engine includes all Exo formats; MAG's identical engine is
 * configured for a subset that excludes fullpage33/35. Never load both engines.
 * A rejected script stays rejected for this document, preventing retry loops.
 */
function loadSdk(document:Document,view:VendorWindow,state:Runtime):Promise<void> {
  if (state.script) return state.script;
  state.script=new Promise<void>((resolve,reject)=>{
    if (view.AdProvider!=null && (!Array.isArray(view.AdProvider)||view.AdProvider.length!==0)) {
      reject(new Error('exoclick_runtime_conflict'));return;
    }
    view.AdProvider=[];
    const script=document.createElement('script');script.src=EXOCLICK_GLOBAL_SCRIPT;
    script.async=true;script.type='application/javascript';script.dataset.lfhExoclickSdk='shared-pem';
    const timer=view.setTimeout(()=>{script.remove();reject(new Error('exoclick_sdk_timeout'));},10_000);
    const fail=()=>{view.clearTimeout(timer);script.remove();reject(new Error('exoclick_sdk_unavailable'));};
    script.addEventListener('error',fail,{once:true});
    script.addEventListener('load',()=>{
      view.clearTimeout(timer);
      if (!view.AdProvider || Array.isArray(view.AdProvider) || typeof view.AdProvider.push!=='function') {fail();return;}
      resolve();
    },{once:true});
    document.head.appendChild(script);
  });
  return state.script;
}

/** Only owned, exact generated classes. The caller must keep the existing
 * global SDK guard: revocation/revision/device changes reload the document.
 * Exo exposes no documented teardown for its page-wide click listeners.
 */
export function mountExoclickGlobalAd(options:{
  placement:AdPlacement;spot:ExoclickGlobalSpot;container:HTMLElement;
  permitted:()=>boolean;onStart:()=>void|boolean;
}):()=>void {
  const {placement,spot,container,permitted,onStart}=options;
  const known=placement==='interstitial'?[DESKTOP_INTERSTITIAL,MOBILE_INTERSTITIAL]:placement==='slider'?[STICKY]:[];
  if (!spot || !known.some(value=>value.zoneId===spot.zoneId&&value.insClass===spot.insClass)) return ()=>{};
  const document=container.ownerDocument,view=document?.defaultView as VendorWindow|null;
  if (!view||!document.body) return ()=>{};
  const state=runtime(document);
  let disposed=false,host:HTMLDivElement|undefined;
  const owner={};
  const allowed=()=>{try{return !disposed&&container.isConnected&&permitted();}catch{return false;}};
  const remove=()=>{disposed=true;if(state.active.get(spot.zoneId)===owner)state.active.delete(spot.zoneId);host?.remove();};
  if (!allowed()||state.active.has(spot.zoneId)||state.served.has(spot.zoneId)) return ()=>{};
  try {if (onStart()===false) return ()=>{};} catch {return ()=>{};}
  state.active.set(spot.zoneId,owner);
  void loadSdk(document,view,state).then(()=>{
    if (!allowed()||state.active.get(spot.zoneId)!==owner||state.served.has(spot.zoneId)) {remove();return;}
    // The Sticky renderer appends its fixed overlay next to ins. A hidden React
    // sentinel would hide that overlay; this owned body host also contains cleanup.
    host=document.createElement('div');host.dataset.lfhExoclickZone=String(spot.zoneId);
    const ins=document.createElement('ins');ins.className=spot.insClass;ins.dataset.zoneid=String(spot.zoneId);
    host.appendChild(ins);document.body.appendChild(host);
    if (!allowed()) {remove();return;}
    const provider=view.AdProvider;
    if (!provider||Array.isArray(provider)) {remove();return;}
    state.served.add(spot.zoneId);
    provider.push({serve:{}});
  }).catch(remove);
  return remove;
}
