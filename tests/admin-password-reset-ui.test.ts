import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import React from 'react';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function text(value:unknown):string {if(Array.isArray(value))return value.map(text).join('');if(React.isValidElement(value))return text((value.props as {children?:unknown}).children);return typeof value==='string'?value:'';}
function find(value:unknown,predicate:(value:React.ReactElement<Record<string,unknown>>)=>boolean):React.ReactElement<Record<string,unknown>>|undefined {
 if(Array.isArray(value)){for(const child of value){const result=find(child,predicate);if(result)return result;}}
 if(React.isValidElement(value)){const element=value as React.ReactElement<Record<string,unknown>>;if(predicate(element))return element;return find(element.props.children,predicate);}
}
function harness(t:TestContext,hash:string,transport:(url:RequestInfo|URL,init?:RequestInit)=>Promise<Response>){
 const oldFetch=globalThis.fetch, oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const history:string[]=[], redirects:string[]=[];
 const location={hash,pathname:'/admin/password/reset',replace:(path:string)=>redirects.push(path)};
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location,history:{state:null,replaceState:(_state:unknown,_unused:string,path:string)=>{history.push(path);location.hash='';}},setTimeout,clearTimeout}});
 globalThis.fetch=transport;t.after(()=>{globalThis.fetch=oldFetch;if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else Reflect.deleteProperty(globalThis,'window');});
 let cursor=0;const state:unknown[]=[];const effects:Array<()=>void>=[];
 const hooks={...React,useState:(initial:unknown)=>{const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],(value:unknown)=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useRef:(initial:unknown)=>{const index=cursor++;if(!(index in state))state[index]={current:initial};return state[index];},useEffect:(effect:()=>void)=>{const index=cursor++;if(!(index in state)){state[index]=true;effects.push(effect);}}};
 const {AdminPasswordReset}=loadAppModule<{AdminPasswordReset:()=>React.ReactElement}>('src/components/AdminPasswordReset.tsx',{react:hooks,'next/link':(props:React.ComponentProps<'a'>)=>React.createElement('a',props)});
 const render=()=>{cursor=0;return AdminPasswordReset();};render();effects.forEach(effect=>effect());
 const input=(name:string,value:string)=>{const node=find(render(),item=>item.type==='input'&&item.props.name===name);assert.ok(node);(node.props.onChange as (e:unknown)=>void)({target:{value}});};
 const submit=()=>{const form=find(render(),item=>item.type==='form');assert.ok(form);return(form.props.onSubmit as(e:unknown)=>Promise<void>)({preventDefault(){}});};
 const button=()=>find(render(),item=>item.type==='button'&&item.props.type==='submit')!.props;
 return{render,input,submit,button,history,redirects,repeatEffect:()=>effects.forEach(effect=>effect())};
}
test('the private fragment is removed immediately, never appears in form markup, and invalid links stay disabled',t=>{
 for(const fragment of ['#'+ 'a'.repeat(64),'#not-a-token']){
  const ui=harness(t,fragment,async()=>Response.json({ok:true}));
  assert.deepEqual(ui.history,['/admin/password/reset']);assert.doesNotMatch(text(ui.render()),/a{64}|not-a-token/);
  ui.repeatEffect();assert.equal(ui.history.length,1);
  assert.equal(ui.button().disabled,fragment==='#not-a-token');
 }
});
test('password validation blocks mismatch, short and long values before making a request',async t=>{
 let calls=0;const ui=harness(t,'#'+'b'.repeat(64),async()=>{calls++;return Response.json({ok:true});});
 for(const [password,confirm] of [['short','short'],['x'.repeat(201),'x'.repeat(201)],['x'.repeat(12),'y'.repeat(12)]]){
  ui.input('password',password);ui.input('confirm',confirm);await ui.submit();
 }
 assert.equal(calls,0);assert.equal(ui.redirects.length,0);
});
test('a confirmed reset submits once, keeps passwords out of URLs and redirects only after exact success',async t=>{
 const requests:RequestInit[]=[];let finish!:(value:Response)=>void;
 const ui=harness(t,'#'+'c'.repeat(64),async(url,init)=>{assert.equal(url,'/api/admin/password/reset');requests.push(init!);return new Promise(resolve=>{finish=resolve;});});
 ui.input('password','  private sentence  ');ui.input('confirm','  private sentence  ');
 const first=ui.submit();void ui.submit();assert.equal(requests.length,1);assert.equal(ui.button().disabled,true);assert.equal(ui.redirects.length,0);
 assert.deepEqual(JSON.parse(String(requests[0].body)),{token:'c'.repeat(64),password:'  private sentence  '});
 finish(Response.json({ok:true}));await first;assert.deepEqual(ui.redirects,['/admin/ads']);
});
test('expired tokens are disabled and ambiguous network or success responses cannot be submitted again',async t=>{
 for(const kind of ['expired','network','bad-success','wrong-status','extra-success'] as const){
  let calls=0;const ui=harness(t,'#'+'d'.repeat(64),async()=>{calls++;if(kind==='network')throw new Error('network');return kind==='expired'?Response.json({ok:false},{status:410}):kind==='wrong-status'?Response.json({ok:true},{status:202}):kind==='extra-success'?Response.json({ok:true,unexpected:true}):Response.json({ok:false});});
  ui.input('password','new private sentence');ui.input('confirm','new private sentence');await ui.submit();
  assert.equal(ui.redirects.length,0);assert.equal(ui.button().disabled,true);await ui.submit();assert.equal(calls,1);
  assert.doesNotMatch(text(ui.render()),/new private sentence/);
  assert.match(text(ui.render()),kind==='expired'?/expiré|utilisé|valide/:/connecter/);
 }
});

test('the same UTF-16 length rule as the backend accepts boundaries without trimming',async t=>{
 for(const password of ['x'.repeat(12),'x'.repeat(200),'🙂'.repeat(6)]){
  let calls=0;const ui=harness(t,'#'+'e'.repeat(64),async()=>{calls++;return Response.json({ok:true});});
  ui.input('password',password);ui.input('confirm',password);await ui.submit();assert.equal(calls,1);
 }
});
test('rate limiting gives a clear error without automatic retries or premature success',async t=>{
 let calls=0;const ui=harness(t,'#'+'f'.repeat(64),async()=>{calls++;return Response.json({ok:false},{status:429});});
 ui.input('password','private example phrase');ui.input('confirm','private example phrase');await ui.submit();await flush();
 assert.equal(calls,1);assert.equal(ui.redirects.length,0);assert.match(text(ui.render()),/Trop de tentatives/);assert.equal(ui.button().disabled,false);
});
