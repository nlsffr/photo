import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node tests require explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
import {ADS_REGISTRY,isValidAdSpot} from '../src/lib/ads-registry-data.mjs';

type Profile='current'|'balanced'|'intensive';
type Placement=keyof typeof ADS_REGISTRY;
const {AD_PROFILE_INFO,adSpotFor,isProfileGalleryAdPosition,profileHasPauseBanner}=loadAppModule<{
  AD_PROFILE_INFO:Array<{key:Profile;title:string;summary:string;details:string[]}>;
  adSpotFor(profile:Profile|undefined,placement:Placement,device:'desktop'|'mobile',page?:{kind:string;pathname:string;collection?:string}):Record<string,unknown>;
  isProfileGalleryAdPosition(count:number,profile?:Profile,device?:'desktop'|'mobile',context?:'gallery'|'creator'|{kind:string;pathname:string;collection?:string}):boolean;
  profileHasPauseBanner(profile?:Profile):boolean;
}>('src/lib/ads-profiles.ts',{'@/lib/ads-registry':{ADS_REGISTRY}});

test('three named profiles retain the current publisher codes and valid vendor settings',()=>{
  assert.deepEqual(AD_PROFILE_INFO.map(p=>p.key),['current','balanced','intensive']);
  for(const profile of AD_PROFILE_INFO) for(const placement of Object.keys(ADS_REGISTRY) as Placement[]) for(const device of ['desktop','mobile'] as const) {
    const spot=adSpotFor(profile.key,placement,device);
    assert.equal(spot.spotId,ADS_REGISTRY[placement][device].spotId);
    assert.ok(isValidAdSpot(spot));
  }
});
test('legacy/current stored format definitions stay unchanged and return stable references',()=>{
  for(const placement of Object.keys(ADS_REGISTRY) as Placement[]) for(const device of ['desktop','mobile'] as const) {
    assert.equal(adSpotFor(undefined,placement,device),ADS_REGISTRY[placement][device]);
    assert.equal(adSpotFor('current',placement,device),ADS_REGISTRY[placement][device]);
    assert.equal(adSpotFor('balanced',placement,device),adSpotFor('balanced',placement,device));
  }
});
test('only intensive creator mobile headers reuse the publisher owned 300x250 format',()=>{
  const creator={kind:'creator',pathname:'/sample-v2/videos',collection:'videos'};
  const selected=adSpotFor('intensive','header','mobile',creator);
  assert.equal(selected,ADS_REGISTRY.underVideo.mobile);
  assert.equal(selected.width,300);assert.equal(selected.height,250);
  for(const profile of ['current','balanced'] as const)assert.equal(adSpotFor(profile,'header','mobile',creator),ADS_REGISTRY.header.mobile);
  for(const page of [{kind:'home',pathname:'/'},{kind:'media',pathname:'/sample/123'},{kind:'models',pathname:'/models'}]){
    assert.equal(adSpotFor('intensive','header','mobile',page),ADS_REGISTRY.header.mobile);
  }
  assert.equal(adSpotFor('intensive','header','desktop',creator),ADS_REGISTRY.header.desktop);
  assert.equal(adSpotFor('intensive','footer','desktop',creator),ADS_REGISTRY.footer.desktop);
});
test('stored vendor frequency templates stay unchanged and only intensive uses native zero initial delay',()=>{
  for(const [profile,count,delay] of [['current',1,60],['balanced',2,30],['intensive',3,5]] as const) {
    const spot=adSpotFor(profile,'popunder','mobile');
    assert.equal(spot.sessionDuration,300);assert.equal(spot.count,count);assert.equal(spot.delay,delay);
    assert.equal(spot.firstDelay,profile==='intensive'?0:5);assert.equal(spot.mode,profile==='intensive'?undefined:'selective');
    assert.equal(adSpotFor(profile,'interstitial','desktop').countdown,5);
    assert.equal(adSpotFor(profile,'interstitial','desktop').cookieExpires,5/60);
    assert.equal(adSpotFor(profile,'slider','mobile').closeButtonDelay,0);
  }
});
test('gallery placement counts media, preserves current rows and separates mobile intensive layout',()=>{
  const positions=(profile:Profile,device:'desktop'|'mobile'='desktop')=>Array.from({length:40},(_,i)=>i+1).filter(i=>isProfileGalleryAdPosition(i,profile,device));
  assert.deepEqual(positions('current'),[8,24,40]);
  assert.deepEqual(positions('balanced'),[6,18,30]);
  assert.deepEqual(positions('intensive'),[2,8,31]);
  assert.deepEqual(positions('intensive','mobile'),[2,8,31]);
  assert.equal(isProfileGalleryAdPosition(42,'intensive','mobile'),false);
  assert.equal(isProfileGalleryAdPosition(54,'intensive','mobile'),true);
  for (const device of ['desktop','mobile'] as const) {
    assert.equal(isProfileGalleryAdPosition(2,'intensive',device,'creator'),false);
    assert.equal(isProfileGalleryAdPosition(8,'intensive',device,'creator'),false);
    assert.equal(isProfileGalleryAdPosition(31,'intensive',device,'creator'),false);
  }
  for(const count of [0,-1,NaN,Infinity,2.5])assert.equal(isProfileGalleryAdPosition(count,'intensive'),false);
  assert.equal(profileHasPauseBanner('current'),false);assert.equal(profileHasPauseBanner('balanced'),false);
  assert.equal(profileHasPauseBanner('intensive'),true);
});
test('intensive native-style positions apply only to home and trending, with no invented 40-media cycle',()=>{
  for(const device of ['desktop','mobile'] as const)for(const pathname of ['/','/trending-medias']){
    const page={kind:pathname==='/'?'home':'gallery',pathname};
    const positions=Array.from({length:80},(_,i)=>i+1).filter(count=>isProfileGalleryAdPosition(count,'intensive',device,page));
    assert.deepEqual(positions,[2,8,31,54,77]);
  }
  for(const pathname of ['/most-liked','/random/medias','/recherche','/tag/example','/pour-toi','/sample/videos']){
    const page={kind:pathname.startsWith('/sample')?'creator':'gallery',pathname};
    for(const count of [2,8,31,54,77])assert.equal(isProfileGalleryAdPosition(count,'intensive','mobile',page),false,pathname);
    for(const profile of ['current','balanced'] as const)for(let count=1;count<=80;count++){
      assert.equal(isProfileGalleryAdPosition(count,profile,'mobile',page),isProfileGalleryAdPosition(count,profile,'mobile'));
    }
  }
});

test('only intensive disables the native interstitial click counter while retaining the five-minute cap and five-second close',()=>{
  for(const device of ['desktop','mobile'] as const){
    for(const profile of ['current','balanced','intensive'] as const){
      const spot=adSpotFor(profile,'interstitial',device);
      assert.equal(spot.countClicks,profile==='intensive'?0:3);
      assert.equal(spot.countdown,5);assert.equal(spot.cookieExpires,5/60);
      assert.equal(spot.spotId,ADS_REGISTRY.interstitial[device].spotId);
      assert.equal(spot.scriptUrl,ADS_REGISTRY.interstitial[device].scriptUrl);
    }
  }
});

test('the registry accepts the native zero-click mode, without accepting negative or fractional counters',()=>{
  for(const device of ['desktop','mobile'] as const){
    const spot=ADS_REGISTRY.interstitial[device];assert.equal(isValidAdSpot({...spot,countClicks:0}),true);
    for(const countClicks of [-1,.5,NaN,Infinity,'0',null])assert.equal(isValidAdSpot({...spot,countClicks}),false,String(countClicks));
  }
});

test('native pop defaults accept only an omitted or selective mode and a nonnegative integer first delay',()=>{
  for(const device of ['desktop','mobile'] as const){
    const spot=ADS_REGISTRY.popunder[device];
    assert.equal(isValidAdSpot({...spot,firstDelay:0,mode:undefined}),true);
    assert.equal(isValidAdSpot({...spot,firstDelay:0,mode:'selective'}),true);
    for(const mode of [null,'all','aggressive',false,0])assert.equal(isValidAdSpot({...spot,mode}),false,String(mode));
    for(const firstDelay of [-1,.5,NaN,Infinity,'0',undefined,null])assert.equal(isValidAdSpot({...spot,firstDelay}),false,String(firstDelay));
  }
});
