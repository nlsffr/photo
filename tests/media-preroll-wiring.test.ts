import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

type Element=React.ReactElement<Record<string,unknown>>;
const nodes=(tree:unknown):Element[]=>Array.isArray(tree)?tree.flatMap(nodes):React.isValidElement(tree)?[tree as Element,...nodes((tree.props as Record<string,unknown>).children)]:[];
const creator={handle:'example_creator',name:'Example Creator',urlVersion:1,verified:false,avatarUrl:'/fixture-avatar.jpg',followers:0};
const source={id:'fixture-db',sourceId:'123',title:'Source title unchanged',description:'Source description unchanged',creatorHandle:creator.handle,
 type:'photo',imageUrl:'/fixture-photo.jpg',urlVersion:1,tags:[],views:12,likes:3,trending:4,ageMinutes:30,width:300,height:400,createdAt:'2026-11-01T12:00:00.000Z'};
function setup(type:string,videoUrl?:string){
 const VideoPlayer=()=>null;const replacements:Record<string,unknown>={
  'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');}},'@/lib/photos':{getPhotoByIdForPage:async()=>({...source,type,videoUrl}),
   getCreator:async()=>creator,getRelatedPhotos:async()=>[],withCreator:(value:object)=>({...value,creator})},
  '@/components/VideoPlayer':{VideoPlayer},'@/components/Interactions':{FollowButton:()=>null,PostActions:()=>null},
 };
 for(const name of ['PhotoCard','VerifiedBadge','MediaImg','Comments','BackLink','FloatingBack','RecordView','JsonLd'])replacements[`@/components/${name}`]={[name]:()=>null};
 const api=loadAppModule<{MediaDetailPage:(props:unknown)=>Promise<unknown>;mediaDetailMetadata:(props:unknown)=>Promise<Record<string,unknown>>}>('src/features/media/MediaDetailPage.tsx',replacements);
 return {...api,VideoPlayer};
}
const props={handleParam:creator.handle,idParam:'123'};
test('only the real media-page video URL opts into the preroll-enabled player without exposing zone data or changing playback inputs',async()=>{
 for(const[type,videoUrl]of [['photo',undefined],['video',undefined],['video','/fixture-video.mp4']] as const){
  const api=setup(type,videoUrl),all=nodes(await api.MediaDetailPage(props)),players=all.filter(node=>node.type===api.VideoPlayer);
  assert.equal(players.length,videoUrl?1:0);if(players.length){
   assert.equal(players[0].props.preroll,true);assert.equal(players[0].props.src,videoUrl);assert.equal(players[0].props.views,source.views);assert.equal(players[0].props.likes,source.likes);
   assert.equal(players[0].props.zoneId,undefined);assert.equal(players[0].props.tagUrl,undefined);
  }
 }
});
test('adding the private preroll entry does not alter media metadata, content URLs or JSON-LD',async()=>{
 const api=setup('video','/fixture-video.mp4'),meta=await api.mediaDetailMetadata(props);
 assert.deepEqual(meta.title,{absolute:source.title+' — LeakFanHub'});assert.equal(meta.description,source.description);assert.equal((meta.alternates as {canonical:string}).canonical,'/example_creator/123');
 const data=nodes(await api.MediaDetailPage(props)).find(node=>Array.isArray(node.props.data))?.props.data;assert.ok(data);
 assert.match(JSON.stringify(data),/fixture-video\.mp4/);assert.doesNotMatch(JSON.stringify(data),/6075526|\/api\/ads\/preroll|magsrv|preroll/);
});
