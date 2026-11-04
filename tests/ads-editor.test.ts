import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import React from 'react';
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
function harness(t:TestContext,transport:(init?:RequestInit)=>Promise<Response>){
 const old=globalThis.fetch;globalThis.fetch=async(_url,init)=>transport(init);t.after(()=>{globalThis.fetch=old;});
 let cursor=0;const state:unknown[]=[];const effects:Array<()=>void>=[];
 const hooks={...React,useState:(initial:unknown)=>{const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],(value:unknown)=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useRef:(initial:unknown)=>{const index=cursor++;if(!(index in state))state[index]={current:initial};return state[index];},useEffect:(effect:()=>void)=>{const index=cursor++;if(!(index in state)){state[index]=true;effects.push(effect);}}};
 const {AdsEditor}=loadAppModule<{AdsEditor:()=>React.ReactElement}>('src/components/AdsEditor.tsx',{react:hooks,'@/lib/ads-registry':{ADS_REGISTRY,isAdsRegistryReady:()=>true,missingAdsPlacements:()=>[]}});
 const render=()=>{cursor=0;return AdsEditor();};render();effects.forEach(effect=>effect());
 return {render,button:(label:string)=>{const node=find(render(),item=>item.type==='button'&&text(item.props.children)===label);assert.ok(node,label);return node.props;}};
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
 const staleMaster=ui.button('Activer la diffusion');const checkbox=find(ui.render(),item=>item.type==='input')!;
 (checkbox.props.onChange as (event:unknown)=>void)({target:{checked:false}});
 (staleMaster.onClick as ()=>void)();assert.equal(writes,0);assert.equal(ui.button('Activer la diffusion').disabled,true);
 (ui.button('Annuler').onClick as ()=>void)();assert.equal(ui.button('Activer la diffusion').disabled,false);
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
