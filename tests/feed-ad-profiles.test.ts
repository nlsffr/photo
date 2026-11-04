import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
// @ts-expect-error Native Node tests require explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Element=React.ReactElement<Record<string,unknown>>;
const all=(node:unknown):Element[]=>Array.isArray(node)?node.flatMap(all):React.isValidElement(node)
  ?[node as Element,...all((node.props as Record<string,unknown>).children)]:[];
function fixture(profile:string,allowed=true,length=19){
  const AdSlot=()=>null,Link=()=>null;
  const hooks={...React,useState:(initial:unknown)=>[initial,()=>{}],useRef:(initial:unknown)=>({current:initial}),useCallback:(fn:unknown)=>fn,useEffect:()=>{}};
  const {FeedViewer}=loadAppModule<{FeedViewer:(props:unknown)=>Element}>('src/components/FeedViewer.tsx',{
    react:hooks,'./AdSlot':{AdSlot},'./LocalizedLink':{LocalizedLink:Link},
    './AdsProvider':{useAds:()=>({runtime:{profile},canServe:()=>allowed})},
    './LocaleProvider':{useLocale:()=>({locale:'en',dictionary:{feed:{empty:'Empty',close:'Close',unmute:'Unmute'},shell:{navigation:{home:'Home'}}}})},
    './Interactions':{},'./MediaImg':{},'./FollowPill':{},'./VerifiedBadge':{},
  });
  const tree=FeedViewer({initial:Array.from({length},(_,i)=>({id:String(i)}))});
  const inserts=all(tree).filter(element=>typeof element.type==='function'&&element.type.name==='FeedAdSlide');
  const render=(element:Element)=>(element.type as (props:unknown)=>Element)(element.props);
  return {tree,inserts,render,AdSlot,Link};
}
test('all three feed profiles preserve media indexes and insert no ad after the final media',()=>{
  for(const profile of ['current','balanced','intensive']){
    const ui=fixture(profile);
    assert.deepEqual(all(ui.tree).filter(e=>e.props['data-feed-idx']!==undefined).map(e=>e.props['data-feed-idx']),Array.from({length:19},(_,i)=>i));
    assert.deepEqual(ui.inserts.map(e=>e.props.after),[4,8,12,16]);
    assert.equal(fixture(profile,true,5).inserts.length,0);
    assert.equal(fixture(profile,false).inserts.length,0);
  }
});
test('provider feed receives stable ordinals; intensive second insertion is only an internal Premium link',()=>{
  for(const profile of ['current','balanced','intensive']){
    const ui=fixture(profile),rendered=ui.inserts.map(ui.render);
    const slots=rendered.flatMap(all).filter(e=>e.type===ui.AdSlot);
    assert.deepEqual(slots.map(e=>e.props.ordinal),profile==='intensive'?[0,2,3]:[0,1,2,3]);
    const links=all(rendered[1]).filter(e=>e.type===ui.Link);
    assert.equal(links.length,profile==='intensive'?1:0);
    if(profile==='intensive'){
      assert.equal(links[0].props.href,'/premium');
      assert.match(String(links[0].props.children),/1[\s,.]?000/);
      assert.match(String(links[0].props.children),/30/);
    }
  }
});
