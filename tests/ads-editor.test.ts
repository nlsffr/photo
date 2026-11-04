import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import {emptyAdPlacements} from '../src/lib/ads-contract.ts';
import {ADS_REGISTRY} from '../src/lib/ads-registry-data.mjs';
const config={enabled:false,revision:7,placements:{...emptyAdPlacements(),header:true},updatedAt:'2026-11-04T01:00:00Z'};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function text(value:unknown):string {if(Array.isArray(value))return value.map(text).join('');if(React.isValidElement(value))return text((value.props as {children?:unknown}).children);return typeof value==='string'?value:'';}
function find(value:unknown,predicate:(value:React.ReactElement<Record<string,unknown>>)=>boolean):React.ReactElement<Record<string,unknown>>|undefined {
 if(Array.isArray(value)){for(const child of value){const result=find(child,predicate);if(result)return result;}}
 if(React.isValidElement(value)){const element=value as React.ReactElement<Record<string,unknown>>;if(predicate(element))return element;return find(element.props.children,predicate);}
}
function all(value:unknown,predicate:(value:React.ReactElement<Record<string,unknown>>)=>boolean):React.ReactElement<Record<string,unknown>>[]{
 if(Array.isArray(value))return value.flatMap(child=>all(child,predicate));
 if(React.isValidElement(value)){const element=value as React.ReactElement<Record<string,unknown>>;return [...(predicate(element)?[element]:[]),...all(element.props.children,predicate)];}
 return [];
}
function harness(t:TestContext,transport:(init?:RequestInit)=>Promise<Response>){
 const old=globalThis.fetch;globalThis.fetch=async(_url,init)=>transport(init);t.after(()=>{globalThis.fetch=old;});
 let cursor=0;const state:unknown[]=[];const effects:Array<()=>void>=[];
 const hooks={...React,useCallback:(callback:unknown)=>callback,useState:(initial:unknown)=>{const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],(value:unknown)=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useRef:(initial:unknown)=>{const index=cursor++;if(!(index in state))state[index]={current:initial};return state[index];},useEffect:(effect:()=>void)=>{const index=cursor++;if(!(index in state)){state[index]=true;effects.push(effect);}}};
 const {AdsEditor}=loadAppModule<{AdsEditor:()=>React.ReactElement}>('src/components/AdsEditor.tsx',{react:hooks,'@/lib/ads-registry':{ADS_REGISTRY,isAdsRegistryReady:()=>true,missingAdsPlacements:()=>[]}});
 const render=()=>{cursor=0;return AdsEditor();};render();effects.forEach(effect=>effect());
 return {render,radios:()=>all(render(),item=>item.type==='input'&&item.props.type==='radio'),button:(label:string)=>{const node=find(render(),item=>item.type==='button'&&text(item.props.children)===label);assert.ok(node,label);return node.props;}};
}

test('master changes take one click, use saved CAS values, and ignore a second tap until confirmation',async t=>{
 const writes:RequestInit[]=[];let finish!:(value:Response)=>void;
 const ui=harness(t,async init=>{if(init?.method==='PUT'){writes.push(init);return new Promise(resolve=>{finish=resolve;});}return Response.json({config,ready:true,missing:[]});});await flush();
 const master=ui.button('Activer la diffusion');(master.onClick as ()=>void)();(master.onClick as ()=>void)();
 assert.equal(writes.length,1);assert.deepEqual(JSON.parse(String(writes[0].body)),{enabled:true,revision:7,placements:config.placements});
 assert.match(text(ui.render()),/Mise à jour en cours/);assert.doesNotMatch(text(ui.render()),/Diffusion activée/);
 finish(Response.json({config:{...config,enabled:true,revision:8},ready:true,missing:[]}));await flush();
 assert.equal(ui.button('Couper la diffusion').disabled,false);assert.match(text(ui.render()),/Diffusion activée/);
});

test('a failed or conflicting write makes state uncertain and prevents more commands until GET refresh',async t=>{
 for(const failed of ['timeout','conflict'] as const){
  let calls=0,writes=0;
  const ui=harness(t,async init=>{calls++;if(init?.method==='PUT'){writes++;if(failed==='timeout')throw new Error('network');return Response.json({error:'conflict'},{status:409});}return Response.json({config:calls>2?{...config,enabled:true,revision:10}:config,ready:true,missing:[]});});await flush();
  (ui.button('Activer la diffusion').onClick as ()=>void)();await flush();
  assert.match(text(ui.render()),/État à vérifier/);assert.equal(ui.button('Activer la diffusion').disabled,true);
  (ui.button('Activer la diffusion').onClick as ()=>void)();await flush();assert.equal(writes,1);
  (ui.button('Recharger').onClick as ()=>void)();await flush();assert.equal(ui.button('Couper la diffusion').disabled,false);
 }
});

test('draft placement edits cannot activate the master before they are saved or cancelled',async t=>{
 let writes=0;const ui=harness(t,async init=>{if(init?.method==='PUT')writes++;return Response.json({config,ready:true,missing:[]});});await flush();
 const staleMaster=ui.button('Activer la diffusion');const checkbox=find(ui.render(),item=>item.type==='input'&&item.props.type==='checkbox')!;
 (checkbox.props.onChange as (event:unknown)=>void)({target:{checked:false}});
 (staleMaster.onClick as ()=>void)();assert.equal(writes,0);assert.equal(ui.button('Activer la diffusion').disabled,true);
 (ui.button('Annuler').onClick as ()=>void)();assert.equal(ui.button('Activer la diffusion').disabled,false);
});

test('three native profile radios expose a current legacy fallback and selecting a profile makes no request',async t=>{
 let writes=0;const ui=harness(t,async init=>{if(init?.method==='PUT')writes++;return Response.json({config,ready:true,missing:[]});});await flush();
 const radios=ui.radios();assert.equal(radios.length,3);
 assert.deepEqual(radios.map(node=>node.props.value),['current','balanced','intensive']);
 assert.deepEqual(radios.map(node=>node.props.checked),[true,false,false]);
 assert.equal(new Set(radios.map(node=>node.props.name)).size,1);
 for(const node of radios){assert.equal(node.props.tabIndex,undefined);assert.equal(node.props.onKeyDown,undefined);assert.ok(node.props.id);}
 const group=find(ui.render(),item=>item.type==='fieldset'&&text(item.props.children).includes('Profil publicitaire'));assert.ok(group);
 const staleMaster=ui.button('Activer la diffusion');
 const staleCheckbox=find(ui.render(),item=>item.type==='input'&&item.props.type==='checkbox')!;
 (radios[2].props.onChange as (event:unknown)=>void)({target:{checked:true}});
 (staleCheckbox.props.onChange as (event:unknown)=>void)({target:{checked:true}});
 assert.equal(writes,0);assert.equal(ui.button('Activer la diffusion').disabled,true);
 (staleMaster.onClick as ()=>void)();assert.equal(writes,0);
 assert.equal(ui.button('Enregistrer la configuration').disabled,false);
 assert.match(text(ui.render()),/Profil enregistré.*Confort/);
 const preview=renderToStaticMarkup(ui.render());assert.match(preview,/data-ad-preview-profile="intensive"/);assert.doesNotMatch(preview,/<script|<iframe|srcdoc=/);
 (staleCheckbox.props.onChange as (event:unknown)=>void)({target:{checked:false}});
 (ui.button('Annuler').onClick as ()=>void)();
 assert.deepEqual(ui.radios().map(node=>node.props.checked),[true,false,false]);assert.equal(ui.button('Activer la diffusion').disabled,false);
 assert.equal(find(ui.render(),item=>item.type==='input'&&item.props.type==='checkbox')?.props.checked,true);
});

test('saving a profile uses one CAS write, requires exact profile confirmation and does not activate the master',async t=>{
 const writes:RequestInit[]=[];let finish!:(response:Response)=>void;
 const ui=harness(t,async init=>{if(init?.method==='PUT'){writes.push(init);return new Promise(resolve=>{finish=resolve;});}return Response.json({config:{...config,profile:'current'},ready:true,missing:[]});});await flush();
 (ui.radios()[1].props.onChange as (event:unknown)=>void)({target:{checked:true}});
 const save=ui.button('Enregistrer la configuration');(save.onClick as ()=>void)();(save.onClick as ()=>void)();
 assert.equal(writes.length,1);assert.deepEqual(JSON.parse(String(writes[0].body)),{revision:7,enabled:false,placements:config.placements,profile:'balanced'});
 finish(Response.json({config:{...config,revision:8,profile:'balanced'},ready:true,missing:[]}));await flush();
 assert.match(text(ui.render()),/Diffusion désactivée/);assert.equal(ui.radios()[1].props.checked,true);
 assert.equal(ui.button('Activer la diffusion').disabled,false);
 (ui.button('Activer la diffusion').onClick as ()=>void)();
 assert.deepEqual(JSON.parse(String(writes[1].body)),{revision:8,enabled:true,placements:config.placements,profile:'balanced'});
 finish(Response.json({config:{...config,revision:9,enabled:true,profile:'balanced'},ready:true,missing:[]}));await flush();
 assert.equal(ui.button('Couper la diffusion').disabled,false);
});

test('wrong or unknown profile confirmations make the state uncertain until a fresh read',async t=>{
 for(const [name,profile] of [['wrong','current'],['unknown','other']] as const)await t.test(name,async sub=>{
  let writes=0;const ui=harness(sub,async init=>{if(init?.method==='PUT'){writes++;return Response.json({config:{...config,revision:8,profile},ready:true,missing:[]});}return Response.json({config:{...config,profile:'current'},ready:true,missing:[]});});await flush();
  (ui.radios()[2].props.onChange as (event:unknown)=>void)({target:{checked:true}});
  (ui.button('Enregistrer la configuration').onClick as ()=>void)();await flush();
  assert.match(text(ui.render()),/État à vérifier/);assert.equal(ui.button('Activer la diffusion').disabled,true);
  assert.equal(ui.button('Enregistrer la configuration').disabled,true);assert.equal(writes,1);
  assert.equal(find(ui.render(),item=>item.type==='fieldset'&&text(item.props.children).includes('Profil publicitaire'))?.props.disabled,true);
  (ui.button('Recharger').onClick as ()=>void)();await flush();assert.equal(ui.button('Activer la diffusion').disabled,false);
 });
});

test('unknown stored profiles are rejected and draft profile plus placements reset together on reload',async t=>{
 let reads=0,writes=0;
 const ui=harness(t,async init=>{if(init?.method==='PUT')writes++;reads++;return Response.json({config:{...config,profile:reads===1?'unknown':reads===2?'intensive':'balanced'},ready:true,missing:[]});});await flush();
 assert.match(text(ui.render()),/État de la diffusion inconnu/);assert.equal(ui.radios().length,0);
 (ui.button('Recharger les réglages').onClick as ()=>void)();await flush();assert.equal(ui.radios()[2].props.checked,true);
 (ui.radios()[0].props.onChange as (event:unknown)=>void)({target:{checked:true}});
 const checkbox=find(ui.render(),item=>item.type==='input'&&item.props.type==='checkbox')!;(checkbox.props.onChange as (event:unknown)=>void)({target:{checked:false}});
 (ui.button('Recharger').onClick as ()=>void)();await flush();assert.equal(ui.radios()[1].props.checked,true);
 assert.equal(find(ui.render(),item=>item.type==='input'&&item.props.type==='checkbox')?.props.checked,true);
 assert.equal(ui.button('Activer la diffusion').disabled,false);assert.equal(writes,0);
});

test('an explicit change back to current still requires a profile field in its confirmation',async t=>{
 const ui=harness(t,async init=>init?.method==='PUT'?Response.json({config:{...config,revision:8},ready:true,missing:[]}):Response.json({config:{...config,profile:'balanced'},ready:true,missing:[]}));await flush();
 (ui.radios()[0].props.onChange as (event:unknown)=>void)({target:{checked:true}});
 (ui.button('Enregistrer la configuration').onClick as ()=>void)();await flush();
 assert.match(text(ui.render()),/État à vérifier/);assert.equal(ui.button('Activer la diffusion').disabled,true);
});

test('a placements-only save from legacy settings never invents a current profile in its request',async t=>{
 const placements={...config.placements,footer:true};const writes:RequestInit[]=[];
 const ui=harness(t,async init=>{
  if(init?.method==='PUT'){writes.push(init);return Response.json({config:{...config,revision:8,placements},ready:true,missing:[]});}
  return Response.json({config,ready:true,missing:[]});
 });await flush();
 const checkbox=find(ui.render(),item=>item.type==='input'&&item.props.type==='checkbox'&&item.props.checked===false)!;
 (checkbox.props.onChange as (event:unknown)=>void)({target:{checked:true}});
 (ui.button('Enregistrer la configuration').onClick as ()=>void)();await flush();
 assert.equal(writes.length,1);assert.deepEqual(JSON.parse(String(writes[0].body)),{revision:7,enabled:false,placements});
 assert.equal(ui.button('Activer la diffusion').disabled,false);assert.doesNotMatch(text(ui.render()),/État à vérifier/);
});

test('a profile omitted from legacy writes can be confirmed as the actual stored intensive profile',async t=>{
 const placements={...config.placements,footer:true};const writes:RequestInit[]=[];
 const ui=harness(t,async init=>{
  if(init?.method==='PUT'){writes.push(init);return Response.json({config:{...config,revision:8,placements,profile:'intensive'},ready:true,missing:[]});}
  return Response.json({config,ready:true,missing:[]});
 });await flush();
 const checkbox=find(ui.render(),item=>item.type==='input'&&item.props.type==='checkbox'&&item.props.checked===false)!;
 (checkbox.props.onChange as (event:unknown)=>void)({target:{checked:true}});
 (ui.button('Enregistrer la configuration').onClick as ()=>void)();await flush();
 assert.equal(Object.hasOwn(JSON.parse(String(writes[0].body)),'profile'),false);
 assert.equal(ui.radios()[2].props.checked,true);assert.match(text(ui.render()),/Profil enregistré.*Intensif/);
 assert.equal(ui.button('Activer la diffusion').disabled,false);assert.doesNotMatch(text(ui.render()),/État à vérifier/);
});

test('a write confirms only the requested state, exact CAS revision and complete placements',async t=>{
 for(const [name,changed] of [
  ['wrong target',{enabled:false,revision:8}],
  ['stale revision',{enabled:true,revision:7}],
  ['unrelated revision',{enabled:true,revision:9}],
  ['different placements',{enabled:true,revision:8,placements:{...config.placements,header:false}}],
  ['partial placements',{enabled:true,revision:8,placements:{header:true}}],
 ] as const) await t.test(name,async sub=>{
  let writes=0;const ui=harness(sub,async init=>{
   if(init?.method==='PUT'){writes++;return Response.json({config:{...config,...changed},ready:true,missing:[]});}
   return Response.json({config,ready:true,missing:[]});
  });await flush();
  (ui.button('Activer la diffusion').onClick as ()=>void)();await flush();
  assert.match(text(ui.render()),/État à vérifier/);assert.equal(ui.button('Activer la diffusion').disabled,true);
  (ui.button('Activer la diffusion').onClick as ()=>void)();assert.equal(writes,1);
 });
});
