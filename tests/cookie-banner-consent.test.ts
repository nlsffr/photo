import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Element=React.ReactElement<Record<string,unknown>>;
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function text(value:unknown):string {if(Array.isArray(value))return value.map(text).join('');if(React.isValidElement(value))return text((value.props as {children?:unknown}).children);return typeof value==='string'?value:'';}
function all(value:unknown,predicate:(element:Element)=>boolean):Element[]{
  if(Array.isArray(value))return value.flatMap(child=>all(child,predicate));
  if(React.isValidElement(value)){const element=value as Element;return [...(predicate(element)?[element]:[]),...all(element.props.children,predicate)];}
  return [];
}
function harness(t:TestContext,options:{enabled?:boolean;offer?:boolean;age?:boolean;audience?:null|'accepted'|'refused';adConsent?:null|'accepted'|'refused';locale?:string;transport?:(init:RequestInit)=>Promise<Response>}={}){
  let age=options.age??false;
  let audience=options.audience??null;
  let adConsent=options.adConsent??null;
  let enabled=options.enabled??true;
  const writes:RequestInit[]=[];
  const jar=new Map<string,string>();
  if(audience)jar.set('lfh_audience',audience);
  if(adConsent)jar.set('lfh_ad_consent',`v1:${adConsent}`);
  const events=new EventTarget();
  const old={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document,location:globalThis.location,localStorage:globalThis.localStorage};
  const documentMock={activeElement:null,get cookie(){return [...jar].map(([key,value])=>`${key}=${value}`).join('; ');},set cookie(value:string){const [key,...parts]=value.split(';')[0].split('=');jar.set(key,parts.join('='));if(key==='lfh_audience')audience=parts.join('=') as typeof audience;if(key==='lfh_ad_consent')adConsent=decodeURIComponent(parts.join('=')).slice(3) as typeof adConsent;}};
  Object.assign(globalThis,{window:Object.assign(events,{setTimeout,clearTimeout}),document:documentMock,location:{protocol:'https:'},localStorage:{setItem:()=>{}}});
  globalThis.fetch=async(url,init)=>{
    assert.equal(url,'/api/cookies/choice');assert.ok(init);writes.push(init);
    const response=options.transport?await options.transport(init):new Response(null,{status:204});
    if(response.status===204){const payload=JSON.parse(String(init.body));audience=payload.choice;jar.set('lfh_audience',audience!);if(payload.advertisingChoice){adConsent=payload.advertisingChoice;jar.set('lfh_ad_consent',`v1%3A${adConsent}`);}}
    return response;
  };
  t.after(()=>Object.assign(globalThis,old));
  let cursor=0;const state:unknown[]=[];
  const hooks={...React,useState:(initial:unknown)=>{const index=cursor++;if(!(index in state))state[index]=typeof initial==='function'?initial():initial;return[state[index],(value:unknown)=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useRef:(initial:unknown)=>{const index=cursor++;if(!(index in state))state[index]={current:initial};return state[index];},useEffect:()=>{}};
  const ads={get consentAvailable(){return enabled;},get consentOffered(){return options.offer??enabled;},get needsConsent(){return (options.offer??enabled)&&adConsent===null;},get consent(){return adConsent;},choose:async()=>{throw new Error('The merged panel must use one combined request.');}};
  const {CookieBanner}=loadAppModule<{CookieBanner:()=>React.ReactElement|null}>('src/components/CookieBanner.tsx',{
    react:hooks,'next/navigation':{usePathname:()=>'/fr'},'next/link':(props:React.ComponentProps<'a'>)=>React.createElement('a',props),
    './BrandLogo':{BrandLogo:()=>null},'./LocaleProvider':{useLocale:()=>({locale:options.locale??'fr',t:()=> '18+ age confirmation'})},
    './AudienceChoice':{useAudienceChoice:()=>audience,CHOICE_CHANGED:'audience-changed',OPEN_CHOICES:'open-choices'},
    './AgeConfirmation':{useAgeConfirmation:()=>({confirmed:age,confirm:()=>{age=true;}})},
    './AdsProvider':{useAds:()=>ads,ADS_CONSENT_CHANGED:'ad-consent-changed'}
  });
  const render=()=>{cursor=0;return CookieBanner();};
  const button=(label:string)=>{const node=all(render(),item=>item.type==='button'&&text(item.props.children)===label)[0];assert.ok(node,label);return node.props;};
  return{render,button,writes,jar,setEnabled:(value:boolean)=>{enabled=value;},checkboxes:()=>all(render(),item=>item.type==='input'&&item.props.type==='checkbox')};
}

test('first entry explains both purposes and accepts them with one request and one panel',async t=>{
  let finish!:(value:Response)=>void;
  const ui=harness(t,{transport:()=>new Promise(resolve=>{finish=resolve;})});
  assert.match(text(ui.render()),/TrafficStars/);
  const enter=ui.button('Entrer');(enter.onClick as ()=>void)();(enter.onClick as ()=>void)();
  assert.equal(ui.writes.length,1);
  assert.deepEqual(JSON.parse(String(ui.writes[0].body)),{choice:'accepted',advertisingChoice:'accepted',ageConfirmed:true});
  assert.equal(ui.jar.has('lfh_ad_consent'),false);
  assert.equal(ui.button('Entrer').disabled,true);
  finish(new Response(null,{status:204}));await flush();
  assert.equal(ui.render(),null);
});

test('the configured advertising purpose is disclosed before the pending runtime and one informed click records both',async t=>{
  const ui=harness(t,{enabled:false,offer:true});
  assert.match(text(ui.render()),/TrafficStars/);
  (ui.button('Entrer').onClick as ()=>void)();await flush();
  assert.equal(ui.writes.length,1);
  assert.deepEqual(JSON.parse(String(ui.writes[0].body)),{choice:'accepted',advertisingChoice:'accepted',ageConfirmed:true});
  assert.equal(ui.render(),null);
  ui.setEnabled(true);assert.equal(ui.render(),null);
});

test('refusing both records local refusals and never opens a second advertising panel after a network error',async t=>{
  const ui=harness(t,{transport:async()=>{throw new Error('network');}});
  (ui.button('Tout refuser').onClick as ()=>void)();await flush();
  assert.deepEqual(JSON.parse(String(ui.writes[0].body)),{choice:'refused',advertisingChoice:'refused',ageConfirmed:true});
  assert.equal(ui.jar.get('lfh_audience'),'refused');assert.equal(ui.jar.get('lfh_ad_consent'),'v1:refused');
  assert.equal(ui.render(),null);
});

test('granular purposes start unchecked and remain independently selectable',async t=>{
  const ui=harness(t);
  (ui.button('Choix des cookies').onClick as ()=>void)();
  const boxes=ui.checkboxes();assert.equal(boxes.length,2);assert.deepEqual(boxes.map(box=>box.props.checked),[false,false]);
  (boxes[0].props.onChange as (event:unknown)=>void)({target:{checked:true}});
  (ui.button('Enregistrer mes choix').onClick as ()=>void)();await flush();
  assert.deepEqual(JSON.parse(String(ui.writes[0].body)),{choice:'accepted',advertisingChoice:'refused',ageConfirmed:true});
  assert.equal(ui.render(),null);
});

test('legacy analytics acceptance never preselects or silently accepts advertising',async t=>{
  const ui=harness(t,{age:true,audience:'accepted'});
  assert.match(text(ui.render()),/TrafficStars/);assert.equal(ui.writes.length,0);assert.equal(ui.jar.has('lfh_ad_consent'),false);
  (ui.button('Choix des cookies').onClick as ()=>void)();
  assert.equal(ui.checkboxes()[1].props.checked,false);
  (ui.button('Enregistrer mes choix').onClick as ()=>void)();await flush();
  assert.equal(JSON.parse(String(ui.writes[0].body)).advertisingChoice,'refused');
});

test('master OFF keeps the analytics-only payload and cannot reopen a prompt if runtime arrives after entry',async t=>{
  const ui=harness(t,{enabled:false});
  assert.doesNotMatch(text(ui.render()),/TrafficStars/);
  (ui.button('Entrer').onClick as ()=>void)();await flush();
  assert.deepEqual(JSON.parse(String(ui.writes[0].body)),{choice:'accepted'});
  ui.setEnabled(true);assert.equal(ui.render(),null);assert.equal(ui.jar.has('lfh_ad_consent'),false);
});

test('failed combined acceptance stays in the same panel without inventing a consent cookie',async t=>{
  const ui=harness(t,{transport:async()=>new Response(null,{status:503})});
  (ui.button('Entrer').onClick as ()=>void)();await flush();
  assert.ok(ui.render());assert.match(text(ui.render()),/n’a pas pu être enregistré/);assert.equal(ui.jar.has('lfh_ad_consent'),false);
  assert.equal(ui.button('Entrer').disabled,false);
});

test('the merged entry and granular purpose labels are localized in all twelve supported languages',async t=>{
  for(const [locale,enter,refuse,manage,save] of [
    ['fr','Entrer','Tout refuser','Choix des cookies','Enregistrer mes choix'],
    ['en','Enter','Decline all','Cookie choices','Save my choices'],
    ['es','Entrar','Rechazar todo','Opciones de cookies','Guardar mis opciones'],
    ['de','Eintreten','Alle ablehnen','Cookie-Auswahl','Auswahl speichern'],
    ['it','Entra','Rifiuta tutto','Scelte sui cookie','Salva le mie scelte'],
    ['pt','Entrar','Recusar tudo','Opções de cookies','Guardar as minhas escolhas'],
    ['nl','Doorgaan','Alles weigeren','Cookiekeuzes','Mijn keuzes opslaan'],
    ['ru','Войти','Отказаться от всех','Настройки cookie','Сохранить мой выбор'],
    ['zh','进入','全部拒绝','Cookie 选项','保存我的选择'],
    ['ja','入場','すべて拒否する','Cookieの選択','選択を保存する'],
    ['hi','प्रवेश करें','सभी अस्वीकार करें','कुकी विकल्प','मेरे विकल्प सहेजें'],
    ['th','เข้าชม','ปฏิเสธทั้งหมด','ตัวเลือกคุกกี้','บันทึกตัวเลือกของฉัน']
  ])await t.test(locale,sub=>{
    const ui=harness(sub,{locale});
    const html=renderToStaticMarkup(ui.render());assert.equal((html.match(/<section/g)||[]).length,1);
    assert.match(html,/TrafficStars/);assert.ok(ui.button(enter));assert.ok(ui.button(refuse));
    (ui.button(manage).onClick as ()=>void)();assert.equal(ui.checkboxes().length,2);assert.ok(ui.button(save));
    assert.doesNotMatch(renderToStaticMarkup(ui.render()),/<script|<iframe/);
  });
});
