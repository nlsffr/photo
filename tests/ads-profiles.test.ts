import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node tests require explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
import {ADS_REGISTRY,isValidAdSpot} from '../src/lib/ads-registry-data.mjs';

type Profile='current'|'balanced'|'intensive';
type Placement=keyof typeof ADS_REGISTRY;
const {AD_PROFILE_INFO,adSpotFor,isProfileGalleryAdPosition,profileHasPauseBanner}=loadAppModule<{
  AD_PROFILE_INFO:Array<{key:Profile;title:string;summary:string;details:string[]}>;
  adSpotFor(profile:Profile|undefined,placement:Placement,device:'desktop'|'mobile'):Record<string,unknown>;
  isProfileGalleryAdPosition(count:number,profile?:Profile,device?:'desktop'|'mobile',context?:'gallery'|'creator'):boolean;
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
test('legacy/current reproduces every existing spot exactly and returns stable references',()=>{
  for(const placement of Object.keys(ADS_REGISTRY) as Placement[]) for(const device of ['desktop','mobile'] as const) {
    assert.equal(adSpotFor(undefined,placement,device),ADS_REGISTRY[placement][device]);
    assert.equal(adSpotFor('current',placement,device),ADS_REGISTRY[placement][device]);
    assert.equal(adSpotFor('balanced',placement,device),adSpotFor('balanced',placement,device));
  }
});
test('pop frequency increases in supported seconds without changing the session or selective mode',()=>{
  for(const [profile,count,delay] of [['current',1,60],['balanced',2,30],['intensive',3,5]] as const) {
    const spot=adSpotFor(profile,'popunder','mobile');
    assert.equal(spot.sessionDuration,300);assert.equal(spot.count,count);assert.equal(spot.delay,delay);
    assert.equal(spot.firstDelay,5);assert.equal(spot.mode,'selective');
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
  assert.deepEqual(positions('intensive','mobile'),[2]);
  assert.equal(isProfileGalleryAdPosition(42,'intensive','mobile'),true);
  for (const device of ['desktop','mobile'] as const) {
    assert.equal(isProfileGalleryAdPosition(2,'intensive',device,'creator'),false);
    assert.equal(isProfileGalleryAdPosition(8,'intensive',device,'creator'),false);
    assert.equal(isProfileGalleryAdPosition(31,'intensive',device,'creator'),false);
  }
  for(const count of [0,-1,NaN,Infinity,2.5])assert.equal(isProfileGalleryAdPosition(count,'intensive'),false);
  assert.equal(profileHasPauseBanner('current'),false);assert.equal(profileHasPauseBanner('balanced'),false);
  assert.equal(profileHasPauseBanner('intensive'),true);
});
