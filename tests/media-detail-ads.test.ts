import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Element=React.ReactElement<Record<string,unknown>>;
const nodes=(tree:unknown):Element[]=>Array.isArray(tree)?tree.flatMap(nodes):React.isValidElement(tree)?[tree as Element,...nodes((tree.props as Record<string,unknown>).children)]:[];
function client(profile:string|undefined,eligible=true){
  let closed=false;const AdSlot=()=>null;
  const api=loadAppModule<{RecommendationAdCard:()=>unknown;RelatedMediaGrid:(props:{children:React.ReactNode})=>unknown;MediaDetailAd:(props:{videoEligible:boolean})=>unknown}>('src/components/MediaDetailAds.tsx',{
    react:{...React,useState:(initial:boolean)=>[closed||initial,(next:boolean)=>{closed=next;}]},
    './AdsProvider':{useAds:()=>({runtime:profile===undefined?null:{profile},canServe:(placement:string)=>eligible&&placement==='underVideo'})},
    './AdSlot':{AdSlot},
  });
  return {...api,AdSlot};
}

test('only intensive and an eligible underVideo placement mount the related portrait card',()=>{
  for(const profile of ['current','balanced',undefined])assert.equal(client(profile).RecommendationAdCard(),null);
  for(const reason of ['OFF','refusal','owner','Premium','stale','unknown'])assert.equal(client('intensive',false).RecommendationAdCard(),null,reason);
  const ui=client('intensive'),tree=ui.RecommendationAdCard();const slot=nodes(tree).find(node=>node.type===ui.AdSlot);
  assert.ok(slot);assert.equal(slot.props.placement,'underVideo');assert.equal(slot.props.layout,'grid');
  assert.equal(nodes(tree)[0].props.className,'min-w-0');
  (slot.props.onEmpty as ()=>void)();assert.equal(ui.RecommendationAdCard(),null);
});

test('the media-page leaf preserves video-only legacy profiles and adds intensive photo support once',()=>{
  for(const profile of ['current','balanced','intensive'])for(const videoEligible of [false,true]){
    const ui=client(profile),tree=ui.MediaDetailAd({videoEligible});const slots=nodes(tree).filter(node=>node.type===ui.AdSlot);
    assert.equal(slots.length,profile==='intensive'||videoEligible?1:0,`${profile}/${videoEligible}`);
    if(slots.length){assert.equal(slots[0].props.placement,'underVideo');assert.equal(slots[0].props.className,profile==='intensive'?'my-[50px]':'mt-6');assert.equal(slots[0].props.context,undefined);}
    assert.equal(client(profile,false).MediaDetailAd({videoEligible}),null);
  }
});

const creator={handle:'example_creator',name:'Example Creator',urlVersion:3,verified:true,avatarUrl:'/avatar.jpg',followers:20};
const media={id:'main-db',sourceId:'123',title:'Source title unchanged',description:'Source description unchanged',creatorHandle:creator.handle,
  type:'photo',imageUrl:'/fixture-photo.jpg',urlVersion:2,tags:['portrait'],views:12,likes:3,trending:4,ageMinutes:300,width:300,height:400};
function server(type='photo',count=5,videoUrl:string|undefined=undefined){
  const related=Object.freeze(Array.from({length:count},(_,index)=>Object.freeze({...media,id:`related-${index+1}`,creator})));
  const PhotoCard=()=>null,RecommendationAdCard=()=>null,MediaDetailAd=()=>null,RelatedMediaGrid=()=>null;const reads:unknown[]=[];
  const replacements:Record<string,unknown>={
    'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');}},
    '@/lib/photos':{getPhotoByIdForPage:async()=>({...media,type,videoUrl}),getCreator:async()=>creator,
      getRelatedPhotos:async(...args:unknown[])=>{reads.push(args);return related;},withCreator:(item:object)=>({...item,creator})},
    '@/components/PhotoCard':{PhotoCard},'@/components/MediaDetailAds':{RecommendationAdCard,MediaDetailAd,RelatedMediaGrid},
    '@/components/Interactions':{FollowButton:()=>null,PostActions:()=>null},
  };
  for(const name of ['VerifiedBadge','MediaImg','VideoPlayer','Comments','BackLink','FloatingBack','RecordView','JsonLd'])replacements[`@/components/${name}`]={[name]:()=>null};
  const api=loadAppModule<{MediaDetailPage:(props:unknown)=>Promise<unknown>;mediaDetailMetadata:(props:unknown)=>Promise<Record<string,unknown>>}>('src/features/media/MediaDetailPage.tsx',replacements);
  return {...api,related,PhotoCard,RecommendationAdCard,MediaDetailAd,reads};
}
const pageProps={locale:'fr',handleParam:creator.handle,idParam:'123-v2'};

test('the real photo and video template inserts one recommendation slot after two without mutating, reordering or replacing media',async()=>{
  for(const type of ['photo','video']){
    const ui=server(type,5,type==='video'?'/fixture-video.mp4':undefined),before=JSON.stringify(ui.related);
    const tree=await ui.MediaDetailPage(pageProps),all=nodes(tree);
    const sequence=all.filter(node=>node.type===ui.PhotoCard||node.type===ui.RecommendationAdCard)
      .map(node=>node.type===ui.PhotoCard?(node.props.photo as {id:string}).id:'AD');
    assert.deepEqual(sequence,['related-1','related-2','AD','related-3','related-4','related-5']);
    const cards=all.filter(node=>node.type===ui.PhotoCard);assert.equal(cards.length,ui.related.length);
    cards.forEach((card,index)=>{assert.equal(card.props.photo,ui.related[index]);assert.equal(card.props.replace,true);assert.equal(card.key,ui.related[index].id);});
    assert.equal(JSON.stringify(ui.related),before);assert.equal(ui.reads.length,1);assert.equal((ui.reads[0] as unknown[])[1],36);
    const leaves=all.filter(node=>node.type===ui.MediaDetailAd);assert.equal(leaves.length,1);assert.equal(leaves[0].props.videoEligible,type==='video');
  }
});

test('short recommendation lists never append a final advertising card and video fallback retains its legacy eligibility flag',async()=>{
  for(const count of [0,1,2]){
    const ui=server('photo',count),tree=await ui.MediaDetailPage(pageProps);
    assert.equal(nodes(tree).filter(node=>node.type===ui.RecommendationAdCard).length,0);
    assert.equal(nodes(tree).filter(node=>node.type===ui.PhotoCard).length,count);
  }
  const missing=server('video',3),tree=await missing.MediaDetailPage(pageProps);
  assert.equal(nodes(tree).find(node=>node.type===missing.MediaDetailAd)?.props.videoEligible,false);
});

test('media metadata and structured data preserve authored copy and canonical URLs',async()=>{
  const ui=server();const metadata=await ui.mediaDetailMetadata(pageProps);
  assert.deepEqual(metadata.title,{absolute:media.title+' — LeakFanHub'});assert.equal(metadata.description,media.description);
  assert.equal((metadata.alternates as {canonical:string}).canonical,'/example_creator/123-v2');
  const data=nodes(await ui.MediaDetailPage(pageProps)).find(node=>Array.isArray(node.props.data))?.props.data;
  assert.ok(data);const serialized=JSON.stringify(data);assert.match(serialized,/https:\/\/leakfanhub\.com\/example_creator\/123-v2/);
  assert.match(serialized,/Source title unchanged/);assert.doesNotMatch(serialized,/\/api\/ads\/|underVideo|recommendation-ad/);
});

test('the recommendations grid uses the existing intensive columns only for intensive and preserves its server children',()=>{
  const children=[React.createElement('span',{key:'first'},'First'),React.createElement('span',{key:'second'},'Second')];
  for(const profile of ['current','balanced','intensive',undefined]){
    const ui=client(profile),tree=ui.RelatedMediaGrid({children}) as Element;
    assert.equal(tree.type,'div');assert.equal(tree.props.className,profile==='intensive'?'media-grid media-grid-intensive':'media-grid');
    assert.equal(tree.props.children,children);assert.deepEqual(nodes(tree).filter(node=>node.type==='span').map(node=>node.key),['first','second']);
  }
});
