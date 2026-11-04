import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ADS_REGISTRY, isAdsRegistryReady } from '../src/lib/ads-registry-data.mjs';
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from './helpers/load-app-module.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import { createAdSdkGuard } from '../src/lib/ads-sdk.ts';

const hooks={...React,useState:(value:unknown)=>[value,()=>{}],useRef:(value:unknown)=>({current:value}),useId:()=>'sample',useEffect:()=>{}};
const locale={locale:'en',t:(key:string)=>key};

test('all seven public network placements render nothing while master is OFF',()=>{
  let mounts=0;
  const {AdSlot,AdsOverlays}=loadAppModule<{AdSlot:React.ComponentType<{placement:string}>;AdsOverlays:React.ComponentType}>('src/components/AdSlot.tsx',{
    react:hooks,'./AdsProvider':{useAds:()=>({canServe:()=>false})},'./LocaleProvider':{useLocale:()=>locale},
    '@/lib/ads-registry':{ADS_REGISTRY},
    '@/lib/ads-sdk':{mountTrafficStarsAd:()=>{mounts++;return()=>{};}},'next/navigation':{usePathname:()=>'/'}
  });
  for(const placement of ['header','footer','underVideo','feed','popunder','interstitial','slider']) assert.equal(renderToStaticMarkup(React.createElement(AdSlot,{placement})), '');
  assert.equal(renderToStaticMarkup(React.createElement(AdsOverlays)), '');
  assert.equal(mounts,0);
});

function cookieBanner(enabled:boolean,age:boolean,choice:null|'accepted'){
  const ads={consentAvailable:enabled,consentOffered:enabled,needsConsent:enabled,consent:null,choose:async()=>true};
  const {CookieBanner}=loadAppModule<{CookieBanner:React.ComponentType}>('src/components/CookieBanner.tsx',{
    react:hooks,'next/navigation':{usePathname:()=>'/'} ,'next/link':(p:React.ComponentProps<'a'>)=>React.createElement('a',p),
    './BrandLogo':{BrandLogo:()=>null},'./LocaleProvider':{useLocale:()=>locale,LanguageSwitcher:()=>null},
    './AudienceChoice':{useAudienceChoice:()=>choice,CHOICE_CHANGED:'changed',OPEN_CHOICES:'open'},
    './AgeConfirmation':{useAgeConfirmation:()=>({confirmed:age,confirm:()=>{}})},'./AdsProvider':{useAds:()=>ads}
  });
  return renderToStaticMarkup(React.createElement(CookieBanner));
}

test('OFF keeps the existing entry dialog without adding advertising consent',()=>{
  const html=cookieBanner(false,false,null);
  assert.equal((html.match(/<section/g)||[]).length,1);
  assert.match(html,/By clicking/); assert.doesNotMatch(html,/TrafficStars/);
});
test('advertising purposes are merged into the entry panel before age confirmation',()=>{
  const html=cookieBanner(true,false,null);
  assert.equal((html.match(/<section/g)||[]).length,1);
  assert.match(html,/TrafficStars/);assert.match(html,/Cookie choices/);assert.match(html,/decline all/i);
  assert.doesNotMatch(html,/<iframe|<script/);
});
test('a legacy analytics choice receives one merged panel without implicit ad acceptance',()=>{
  const html=cookieBanner(true,true,'accepted');
  assert.equal((html.match(/<section/g)||[]).length,1);
  assert.match(html,/TrafficStars/);assert.match(html,/Cookie choices/);assert.match(html,/decline all/i);
  assert.doesNotMatch(html,/Ads and advertising cookies/);assert.doesNotMatch(html,/<iframe|<script/);
});

test('fresh eligible runtime can explain consent before age but cannot serve any placement',()=>{
  const runtime={enabled:true,effectiveEnabled:false,revision:4,needsConsent:true,consent:null,
    placements:{header:false,footer:false,underVideo:false,feed:false,popunder:false,interstitial:false,slider:false},reason:'consent_required'};
  for(const [fresh,context,available] of [[true,'false:guest:true:false',true],[false,'false:guest:true:false',false],[true,'old-session',false]] as const){
    const initial=[runtime,Date.now(),fresh,context,null,'ready'];let cursor=0;
    type Snapshot={consentAvailable:boolean;canServe:(placement:string)=>boolean};
    const {AdsProvider}=loadAppModule<{AdsProvider:(props:{children:React.ReactNode})=>React.ReactElement<{value:Snapshot}>}>('src/components/AdsProvider.tsx',{
      react:{...React,useState:()=>[initial[cursor++],()=>{}],useRef:(value:unknown)=>({current:value}),useEffect:()=>{},useCallback:(value:unknown)=>value},
      '@/lib/ads-sdk':{createAdSdkGuard},
      '@/lib/ads-registry':{isAdsRegistryReady},
      'next/navigation':{usePathname:()=>'/en'},'./AgeConfirmation':{useAgeConfirmation:()=>({confirmed:false})},
      './Session':{useSession:()=>({loading:false,user:null})},'./Premium':{usePremium:()=>({ready:true,isPremium:false})}
    });
    const value=AdsProvider({children:null}).props.value;
    assert.equal(value.consentAvailable,available);
    for(const placement of ['header','footer','underVideo','feed','popunder','interstitial','slider'])assert.equal(value.canServe(placement),false);
  }
});

test('eligible inline advertising uses a same-origin HTTP frame rather than a parent SDK',()=>{
  let mounts=0;
  const {AdSlot}=loadAppModule<{AdSlot:React.ComponentType<{placement:string}>}>('src/components/AdSlot.tsx',{
    react:{...hooks,useState:()=>['mobile',()=>{}]},'./AdsProvider':{useAds:()=>({canServe:()=>true})},'./LocaleProvider':{useLocale:()=>locale},
    '@/lib/ads-registry':{ADS_REGISTRY},'@/lib/ads-sdk':{mountTrafficStarsAd:()=>{mounts++;return()=>{};}},'next/navigation':{usePathname:()=>'/'}
  });
  const html=renderToStaticMarkup(React.createElement(AdSlot,{placement:'header'}));
  assert.match(html,/src="\/api\/ads\/embed\?placement=header&amp;device=mobile"/);
  assert.match(html,/sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"/);
  assert.doesNotMatch(html,/<script|srcdoc=|https:\/\/cdn\./);assert.equal(mounts,0);
});
