import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type AgeModule={useAgeConfirmation():{confirmed:boolean|undefined;confirm:()=>void}};
function fixture(t:TestContext,{readFails=false,writeFails=false,initial=null as string|null}={}){
  let stored=initial,role='entry',server=false;
  const states=new Map<string,unknown>(),subscriptions=new Map<string,()=>void>(),updates=new Map<string,number>();
  const before={window:globalThis.window,localStorage:globalThis.localStorage};
  const events=new EventTarget();
  const storage={getItem:()=>{if(readFails)throw Error('fixture_storage_blocked');return stored;},
    setItem:(_key:string,value:string)=>{if(writeFails)throw Error('fixture_storage_blocked');stored=value;}};
  Object.assign(globalThis,{window:events,localStorage:storage});
  const hooks={useState:(initial:unknown)=>{const key=role;if(!states.has(key))states.set(key,initial);return[states.get(key),(value:unknown)=>states.set(key,value)];},
    useSyncExternalStore:(subscribe:(update:()=>void)=>()=>void,read:()=>unknown,ssr:()=>unknown)=>{
      if(server)return ssr();
      const key=role;
      if(!subscriptions.has(key))subscriptions.set(key,subscribe(()=>updates.set(key,(updates.get(key)??0)+1)));
      return read();
    }};
  const load=()=>loadAppModule<AgeModule>('src/components/AgeConfirmation.ts',{react:hooks});
  const api=load();
  t.after(()=>{for(const unsubscribe of subscriptions.values())unsubscribe();Object.assign(globalThis,before);});
  return{render(name:string){role=name;return api.useAgeConfirmation();},
    ageEvent(){events.dispatchEvent(new Event('lfh:age-confirmed'));},
    storageEvent(key:string|null,value:string|null){if(key==='lumen_age_ok'||key===null)stored=value;events.dispatchEvent(Object.assign(new Event('storage'),{key,newValue:value}));},
    updates:(name:string)=>updates.get(name)??0,
    unmount(name:string){subscriptions.get(name)?.();subscriptions.delete(name);},
    newDocument(){role='new-document';return load().useAgeConfirmation();},
    serverSnapshot(){server=true;try{return api.useAgeConfirmation().confirmed;}finally{server=false;}}};
}

test('two real hook consumers share an explicit age confirmation when the storage write is refused',t=>{
  const ui=fixture(t,{writeFails:true});
  const entry=ui.render('entry');assert.equal(entry.confirmed,false);assert.equal(ui.render('ads').confirmed,false);
  entry.confirm();
  assert.ok(ui.updates('entry')>0);assert.ok(ui.updates('ads')>0);
  assert.equal(ui.render('entry').confirmed,true);assert.equal(ui.render('ads').confirmed,true);
});

test('blocked storage reads and writes retain the explicit choice only in the current document',t=>{
  const ui=fixture(t,{readFails:true,writeFails:true});
  ui.render('entry').confirm();assert.equal(ui.render('ads').confirmed,true);
  assert.equal(ui.newDocument().confirmed,false);assert.equal(ui.serverSnapshot(),undefined);
});

test('a refused storage read still propagates confirmation when writes appear to succeed',t=>{
  const ui=fixture(t,{readFails:true});ui.render('entry').confirm();assert.equal(ui.render('ads').confirmed,true);
});

test('age events and unrelated storage events never create an unconfirmed choice',t=>{
  const ui=fixture(t,{writeFails:true});ui.render('entry');ui.render('ads');
  ui.ageEvent();ui.storageEvent('other-key','1');
  assert.equal(ui.render('entry').confirmed,false);assert.equal(ui.render('ads').confirmed,false);
});

test('explicit removal or replacement of the age marker revokes the shared fallback',t=>{
  const ui=fixture(t,{writeFails:true});ui.render('entry').confirm();assert.equal(ui.render('ads').confirmed,true);
  ui.storageEvent('advertising-choice','refused');assert.equal(ui.render('ads').confirmed,true);
  ui.storageEvent('lumen_age_ok',null);assert.equal(ui.render('entry').confirmed,false);assert.equal(ui.render('ads').confirmed,false);
  ui.render('entry').confirm();ui.storageEvent('lumen_age_ok','0');assert.equal(ui.render('ads').confirmed,false);
  ui.render('entry').confirm();ui.storageEvent(null,null);assert.equal(ui.render('ads').confirmed,false);
});

test('successful persistence remains compatible and removal does not leave a hook-local grant',t=>{
  const ui=fixture(t);ui.render('entry').confirm();assert.equal(ui.render('ads').confirmed,true);
  ui.storageEvent('lumen_age_ok',null);assert.equal(ui.render('entry').confirmed,false);assert.equal(ui.render('ads').confirmed,false);
});

test('existing age markers still work and unmount removes each consumer subscription',t=>{
  const ui=fixture(t,{initial:'1'});assert.equal(ui.render('entry').confirmed,true);assert.equal(ui.render('ads').confirmed,true);
  ui.unmount('ads');const before=ui.updates('ads');ui.ageEvent();assert.equal(ui.updates('ads'),before);
});
