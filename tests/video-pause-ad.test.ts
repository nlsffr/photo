// @ts-expect-error Native Node requires explicit suffixes.
import { LOCALES as ACTIVE_LOCALES } from "../src/lib/i18n/config.ts";
import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import React from 'react';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import {adsCopy} from '../src/lib/ads-copy.ts';
import {ADS_REGISTRY} from '../src/lib/ads-registry-data.mjs';
// @ts-expect-error Native Node requires explicit suffixes.
import {getDictionary} from '../src/lib/i18n/dictionaries.ts';

type Element = React.ReactElement<Record<string, unknown>>;
const all = (value:unknown):Element[] => Array.isArray(value) ? value.flatMap(all) : React.isValidElement(value)
  ? [value as Element, ...all((value.props as Record<string,unknown>).children)] : [];
const same = (a:unknown[]|undefined,b:unknown[]) => Boolean(a && a.length===b.length && a.every((v,i)=>Object.is(v,b[i])));

function harness(t:TestContext, {profile='intensive', allowed=true, width=316, height=380, locale='en', observer=true} = {}) {
  let cursor=0, permit=allowed, currentProfile=profile, blocked=false, box={width,height};
  const cells:unknown[]=[]; let pending:Array<()=>void>=[];
  const hooks={...React,
    useState:(initial:unknown)=>{const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],(v:unknown)=>{cells[i]=typeof v==='function'?v(cells[i]):v;}];},
    useRef:(initial:unknown)=>{const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
    useEffect:(fn:()=>void|(()=>void),deps:unknown[])=>{const i=cursor++,old=cells[i] as {deps:unknown[];cleanup?:()=>void}|undefined;
      if(!old||!same(old.deps,deps)){const entry={deps,cleanup:undefined as (()=>void)|undefined};cells[i]=entry;pending.push(()=>{old?.cleanup?.();entry.cleanup=fn()||undefined;});}},
  };
  const video=Object.assign(new EventTarget(),{paused:true,ended:false,error:null as object|null,webkitPresentationMode:'inline',webkitDisplayingFullscreen:false});
  const shell={getBoundingClientRect:()=>box};
  const documentMock=Object.assign(new EventTarget(),{hidden:false,pictureInPictureElement:null as unknown,fullscreenElement:null as unknown});
  const frames=new Map<number,FrameRequestCallback>();let id=0;
  const windowMock=Object.assign(new EventTarget(),{requestAnimationFrame:(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id;},cancelAnimationFrame:(key:number)=>frames.delete(key)});
  let resized:(()=>void)|undefined, disconnected=false;
  const before={document:globalThis.document,window:globalThis.window,ResizeObserver:globalThis.ResizeObserver};
  Object.assign(globalThis,{document:documentMock,window:windowMock,ResizeObserver:observer ? class {
    constructor(fn:()=>void){resized=fn;} observe(){} disconnect(){disconnected=true;}
  } : undefined});
  const AdSlot=()=>null;
  const {VideoPauseAd}=loadAppModule<{VideoPauseAd:(p:unknown)=>Element|null}>('src/components/VideoPauseAd.tsx',{
    react:hooks,'./AdSlot':{AdSlot},'./AdsProvider':{useAds:()=>({runtime:{profile:currentProfile},canServe:(p:string)=>permit&&p==='underVideo'})},
    './LocaleProvider':{useLocale:()=>({locale})},
    '@/lib/ads-registry':{ADS_REGISTRY},
  });
  const refs={video:{current:video},shell:{current:shell}};
  const render=()=>{cursor=0;const value=VideoPauseAd({...refs,blocked});const effects=pending;pending=[];effects.forEach(fn=>fn());return value;};
  const emit=(name:string)=>video.dispatchEvent(new Event(name));
  const show=()=>{video.paused=false;emit('playing');video.paused=true;emit('pause');return render();};
  const slots=(tree:unknown)=>all(tree).filter(e=>e.type===AdSlot);
  render();render();
  t.after(()=>{for(const cell of cells)(cell as {cleanup?:()=>void}|null)?.cleanup?.();Object.assign(globalThis,before);});
  return {video,document:documentMock,render,emit,show,slots,
    allow(value:boolean){permit=value;},profile(value:string){currentProfile=value;},
    blocked(value:boolean){blocked=value;},
    resize(w:number,h:number){box={width:w,height:h};if(observer)resized?.();else {windowMock.dispatchEvent(new Event('resize'));for(const [key,fn] of frames){frames.delete(key);fn(0);}}},
    close(){for(const cell of cells)(cell as {cleanup?:()=>void}|null)?.cleanup?.();return disconnected;},
  };
}

test('initial pause/play intent never mounts an ad; actual playback then pause mounts eager underVideo',t=>{
  const ui=harness(t);assert.equal(ui.render(),null);ui.emit('pause');assert.equal(ui.render(),null);
  ui.emit('playing');ui.emit('pause');assert.equal(ui.render(),null);
  ui.video.paused=false;ui.emit('play');ui.video.paused=true;ui.emit('pause');assert.equal(ui.render(),null);
  const tree=ui.show(),slots=ui.slots(tree);assert.equal(slots.length,1);assert.equal(slots[0].props.placement,'underVideo');assert.equal(slots[0].props.loading,'eager');assert.equal(slots[0].props.context,'pause');
});

test('play, playing, ended and error immediately hide the ad',async t=>{
  for(const event of ['play','playing','ended','error'])await t.test(event,sub=>{
    const ui=harness(sub);assert.equal(ui.slots(ui.show()).length,1);ui.emit(event);assert.equal(ui.render(),null);
  });
});

test('ending, media failure and reload require a new successful playback before another pause ad',async t=>{
  for(const event of ['ended','error','emptied','loadstart'])await t.test(event,sub=>{
    const ui=harness(sub);ui.show();ui.emit(event);ui.emit('pause');assert.equal(ui.render(),null);
    assert.equal(ui.slots(ui.show()).length,1);
  });
});

test('ended/error state, hidden tabs and picture-in-picture cannot mount a pause ad',async t=>{
  for(const kind of ['ended','error','hidden','pip','webkit'])await t.test(kind,sub=>{
    const ui=harness(sub);assert.equal(ui.slots(ui.show()).length,1);
    if(kind==='ended')ui.video.ended=true;
    if(kind==='error')ui.video.error={code:3};
    if(kind==='hidden'){ui.document.hidden=true;ui.document.dispatchEvent(new Event('visibilitychange'));}
    if(kind==='pip'){ui.document.pictureInPictureElement=ui.video;ui.emit('enterpictureinpicture');}
    if(kind==='webkit'){ui.video.webkitPresentationMode='picture-in-picture';ui.emit('webkitpresentationmodechanged');}
    ui.emit('pause');assert.equal(ui.render(),null);
  });
});

test('current/balanced profiles and all canServe exclusions keep the frame absent',async t=>{
  for(const profile of ['current','balanced'])await t.test(profile,sub=>{const ui=harness(sub,{profile});assert.equal(ui.show(),null);});
  for(const reason of ['refused','Premium','owner','OFF','unresolved'])await t.test(reason,sub=>{
    const ui=harness(sub,{allowed:false});assert.equal(ui.show(),null);ui.allow(true);assert.equal(ui.slots(ui.render()).length,1);ui.allow(false);assert.equal(ui.render(),null);
  });
});

test('close is a translated 44px button and stays closed for the same source across replay/profile changes',t=>{
  const ui=harness(t),tree=ui.show();const close=all(tree).find(e=>e.type==='button')!;
  assert.equal(close.props['aria-label'],adsCopy.en.close);assert.equal(close.props.type,'button');assert.match(String(close.props.className),/h-11.*w-11/);
  let stopped=false;(close.props.onClick as (e:unknown)=>void)({stopPropagation(){stopped=true;}});assert.equal(stopped,true);assert.equal(ui.render(),null);
  ui.profile('current');ui.render();ui.profile('intensive');assert.equal(ui.show(),null);
});

test('all twelve close labels come from adsCopy',async t=>{
  for(const locale of ACTIVE_LOCALES)await t.test(locale,sub=>{
    const ui=harness(sub,{locale}),tree=ui.show();assert.equal(all(tree).find(e=>e.type==='button')?.props['aria-label'],adsCopy[locale].close);
  });
});

test('small frames remove the ad and ResizeObserver cleanup disconnects',t=>{
  const ui=harness(t);assert.equal(ui.slots(ui.show()).length,1);ui.resize(315,380);assert.equal(ui.render(),null);
  ui.resize(316,379);assert.equal(ui.render(),null);ui.resize(316,380);assert.equal(ui.slots(ui.render()).length,1);assert.equal(ui.close(),true);
});

test('without ResizeObserver initial measurement and a throttled resize fallback work',t=>{
  const ui=harness(t,{observer:false,width:315});assert.equal(ui.show(),null);ui.resize(316,380);assert.equal(ui.slots(ui.render()).length,1);
});

test('cleanup removes video and visibility handlers rather than leaving global loops',t=>{
  const ui=harness(t);ui.close();ui.emit('playing');ui.emit('pause');assert.equal(ui.render(),null);
});

test('a parent error/buffering blocks the frame immediately and unblocking alone cannot remount it',t=>{
  const ui=harness(t);assert.equal(ui.slots(ui.show()).length,1);
  ui.blocked(true);assert.equal(ui.render(),null);ui.emit('pause');assert.equal(ui.render(),null);
  ui.blocked(false);assert.equal(ui.render(),null);ui.emit('pause');assert.equal(ui.slots(ui.render()).length,1);
});

test('a playing event that resolves buffering still permits only the next actual pause',t=>{
  const ui=harness(t);ui.blocked(true);ui.render();ui.video.paused=false;ui.emit('playing');
  ui.blocked(false);assert.equal(ui.render(),null);ui.video.paused=true;ui.emit('pause');assert.equal(ui.slots(ui.render()).length,1);
});

test('native Safari fullscreen mode/property/events hide ads, without blocking desktop shell fullscreen',async t=>{
  for(const mode of ['mode','property','begin-event'])await t.test(mode,sub=>{
    const ui=harness(sub);assert.equal(ui.slots(ui.show()).length,1);
    if(mode==='mode'){ui.video.webkitPresentationMode='fullscreen';ui.emit('webkitpresentationmodechanged');}
    if(mode==='property'){ui.video.webkitDisplayingFullscreen=true;ui.emit('webkitpresentationmodechanged');}
    if(mode==='begin-event')ui.emit('webkitbeginfullscreen');
    assert.equal(ui.render(),null);ui.emit('pause');assert.equal(ui.render(),null);
    ui.video.webkitPresentationMode='inline';ui.video.webkitDisplayingFullscreen=false;ui.emit('webkitendfullscreen');
    ui.emit('webkitpresentationmodechanged');assert.equal(ui.render(),null);
  });
  await t.test('desktop-shell',sub=>{const ui=harness(sub);ui.document.fullscreenElement={};assert.equal(ui.slots(ui.show()).length,1);});
});

test('the real player blocks its pause leaf for buffering and a rejected play Promise without media events',async()=>{
  let cursor=0;const cells:unknown[]=[];
  const hooks={...React,useState:(initial:unknown)=>{const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],(value:unknown)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
    useRef:(initial:unknown)=>{const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
    useEffect:()=>{},useCallback:(callback:unknown)=>callback};
  const Pause=()=>null, dictionary=getDictionary('en');
  const {VideoPlayer}=loadAppModule<{VideoPlayer:(p:{src:string})=>Element}>('src/components/VideoPlayer.tsx',{
    react:hooks,'./VideoPauseAd':{VideoPauseAd:Pause},'./LocaleProvider':{useLocale:()=>({locale:'en',dictionary})},
  });
  const keyed=VideoPlayer({src:'/synthetic.mp4'}),Source=keyed.type as (p:unknown)=>Element;
  const render=()=>{cursor=0;return Source(keyed.props);};
  let tree=render();const media=all(tree).find(e=>e.type==='video')!;
  const video={paused:true,error:null,play:()=>Promise.reject(Object.assign(new Error('synthetic'),{name:'NotSupportedError'}))};
  (media.props.ref as {current:unknown}).current=video;
  assert.equal(all(tree).find(e=>e.type===Pause)?.props.blocked,false);
  (all(tree).find(e=>e.type==='button'&&e.props['aria-label']===dictionary.feed.play)!.props.onClick as ()=>void)();
  tree=render();assert.equal(all(tree).find(e=>e.type===Pause)?.props.blocked,true);
  await new Promise<void>(resolve=>setImmediate(resolve));
  tree=render();assert.equal(video.error,null);assert.equal(all(tree).find(e=>e.type===Pause)?.props.blocked,true);
  assert.ok(all(tree).some(e=>e.type==='button'&&e.props.children===dictionary.video.retry));
});

test('different video source keys own fresh playback and pause-ad state',()=>{
  const {VideoPlayer}=loadAppModule<{VideoPlayer:(props:{src:string})=>Element}>('src/components/VideoPlayer.tsx',{
    './VideoPauseAd':{VideoPauseAd:()=>null},
    './LocaleProvider':{useLocale:()=>({locale:'en'})},
  });
  assert.equal(VideoPlayer({src:'/fixture-one.mp4'}).key,'/fixture-one.mp4');
  assert.equal(VideoPlayer({src:'/fixture-two.mp4'}).key,'/fixture-two.mp4');
});


test('an empty or closed NonLinear creative closes the pause wrapper without another provider or re-pause retry',t=>{
  const ui=harness(t),slot=ui.slots(ui.show())[0];assert.equal(typeof slot.props.onEmpty,'function');
  (slot.props.onEmpty as ()=>void)();assert.equal(ui.render(),null);assert.equal(ui.show(),null);
});
