import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from './helpers/load-app-module.ts';
import { validateAdsSave } from '../src/lib/ads-store-core.mjs';
type Route={GET():Promise<Response>;PUT(request:Request):Promise<Response>;POST(request:Request):Promise<Response>};
const config={revision:0,enabled:false,updatedAt:null,profile:'current',placements:{header:true,footer:true,underVideo:true,feed:true,popunder:true,interstitial:true,slider:true}};
const input={revision:0,enabled:false,placements:config.placements};
function admin(user:{id:string}|null,allowed=true,error?:string,actualOwnerCheck=false) {
  const writes:unknown[]=[];
  const access=loadAppModule<Record<string,unknown>>('src/lib/seo-editor-access.ts',{'server-only':{},'next/headers':{},'./auth-db':{}});
  const adsAccess=actualOwnerCheck ? loadAppModule<Record<string,unknown>>('src/lib/ads-access.ts',{'server-only':{},'./seo-editor-access':{getSeoEditorSessionUser:async()=>user}}) : {isAdsEditorId:()=>allowed};
  return {writes,route:loadAppModule<Route>('src/app/api/admin/ads/route.ts',{
    '@/lib/seo-editor-access':{...access,getSeoEditorSessionUser:async()=>user,isSeoEditorId:()=>allowed},
    '@/lib/ads-access':adsAccess,
    '@/lib/ads-store':{validateAdsSave,getAdsConfig:async()=>config,putAdsConfig:async(...args:unknown[])=>{writes.push(args);return error?{ok:false,error}:{ok:true,config:{...config,profile:(args[0] as {profile?:string}).profile??config.profile}};}},
    '@/lib/ads-registry-data.mjs':{isAdsRegistryReady:()=>true,missingAdsPlacements:()=>[]},
  })};
}
function request(body:unknown=input,origin='https://ads-fixture.example',method='PUT') {
  return new Request('https://ads-fixture.example/api/admin/ads',{method,headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
}
test('ads administration denies anonymous/non-owner and blocks missing/foreign Origin',async()=>{
  const previous=process.env.NEXT_PUBLIC_SITE_URL;process.env.NEXT_PUBLIC_SITE_URL='https://ads-fixture.example';
  try {
    for (const [user,allowed,status] of [[null,true,401],[{id:'other'},false,403]] as const) {
      const api=admin(user,allowed);assert.equal((await api.route.GET()).status,status);assert.equal((await api.route.PUT(request())).status,status);assert.equal(api.writes.length,0);
    }
    const api=admin({id:'owner'});
    assert.equal((await api.route.PUT(request(input,'https://foreign.example'))).status,403);
    assert.equal((await api.route.PUT(new Request('https://ads-fixture.example/api/admin/ads',{method:'PUT',body:'{}'}))).status,403);
    const cross=request();cross.headers.set('sec-fetch-site','cross-site');assert.equal((await api.route.PUT(cross)).status,403);
    assert.equal(api.writes.length,0);
  } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=previous;}
});

test('the private settings route accepts only known profiles and keeps legacy omission intact',async()=>{
  const previous=process.env.NEXT_PUBLIC_SITE_URL;process.env.NEXT_PUBLIC_SITE_URL='https://ads-fixture.example';
  try {
    const api=admin({id:'owner'});
    assert.equal((await (await api.route.GET()).json()).config.profile,'current');
    for(const profile of ['current','balanced','intensive']){
      const response=await api.route.PUT(request({...input,profile}));assert.equal(response.status,200);
      assert.equal((await response.json()).config.profile,profile);
      assert.equal((api.writes.at(-1) as [{profile:string}])[0].profile,profile);
    }
    const before=api.writes.length;
    for(const profile of ['unknown','BALANCED','',null,0,{}])assert.equal((await api.route.PUT(request({...input,profile}))).status,400);
    assert.equal(api.writes.length,before);
    assert.equal((await api.route.PUT(request(input))).status,200);
    assert.equal(Object.hasOwn((api.writes.at(-1) as [object])[0],'profile'),false);
  } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=previous;}
});
test('advertising administration requires exactly one configured owner, never a widened SEO allowlist',async()=>{
  const previous=process.env.SEO_EDITOR_USER_IDS;
  try {
    const api=admin({id:'owner'},true,undefined,true);
    process.env.SEO_EDITOR_USER_IDS='owner';assert.equal((await api.route.GET()).status,200);
    for(const ids of ['','owner,other','owner,owner','other']) {
      process.env.SEO_EDITOR_USER_IDS=ids;
      assert.equal((await api.route.GET()).status,403);
      assert.equal((await api.route.PUT(request())).status,403);
    }
    assert.equal(api.writes.length,0);
  } finally {if(previous===undefined)delete process.env.SEO_EDITOR_USER_IDS;else process.env.SEO_EDITOR_USER_IDS=previous;}
});
test('ads administration accepts strict settings and maps conflict, readiness and storage failures',async()=>{
  const previous=process.env.NEXT_PUBLIC_SITE_URL;process.env.NEXT_PUBLIC_SITE_URL='https://ads-fixture.example';
  try {
    const api=admin({id:'owner'});const response=await api.route.PUT(request());assert.equal(response.status,200);assert.deepEqual((await response.json()).config,config);assert.equal(api.writes.length,1);
    assert.equal((await api.route.PUT(request({...input,script:'x'}))).status,400);
    assert.equal((await api.route.PUT(request({...input,placements:{...input.placements,feed:1}}))).status,400);
    for (const [error,status] of [['conflict',409],['not_ready',400],['unavailable',503]] as const) assert.equal((await admin({id:'owner'},true,error).route.PUT(request())).status,status);
    assert.match(response.headers.get('cache-control')??'',/no-store/);
  } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=previous;}
});
test('advertising consent is separate, versioned, and accepting requires an explicit age confirmation',async()=>{
  const previous=process.env.NEXT_PUBLIC_SITE_URL,mode=process.env.NODE_ENV;process.env.NEXT_PUBLIC_SITE_URL='https://ads-fixture.example';
  (process.env as Record<string,string|undefined>).NODE_ENV='production';
  try {
    const route=loadAppModule<Route>('src/app/api/ads/consent/route.ts',{'server-only':{},'next/headers':{},'./auth-db':{}});
    for (const body of [{choice:'accepted'},{choice:'accepted',ageConfirmed:false},{choice:['accepted'],ageConfirmed:true},{choice:'accepted',ageConfirmed:true,script:'x'}]) assert.equal((await route.POST(request(body,undefined,'POST'))).status,400);
    const accepted=await route.POST(request({choice:'accepted',ageConfirmed:true},undefined,'POST'));
    assert.equal(accepted.status,204);const cookie=accepted.headers.get('set-cookie')??'';
    assert.match(cookie,/lfh_ad_consent=v1%3Aaccepted/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=lax/i);assert.doesNotMatch(cookie,/lfh_audience|lumen_session/);
    assert.equal((await route.POST(request({choice:'refused'},undefined,'POST'))).status,204);
    assert.equal((await route.POST(request({choice:'accepted',ageConfirmed:true},'https://foreign.example','POST'))).status,403);
  } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;else process.env.NEXT_PUBLIC_SITE_URL=previous;(process.env as Record<string,string|undefined>).NODE_ENV=mode;}
});
