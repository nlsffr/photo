import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ADS_REGISTRY } from '../src/lib/ads-registry-data.mjs';
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from './helpers/load-app-module.ts';

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
  const ads={consentAvailable:enabled,needsConsent:enabled,consent:null,choose:async()=>true};
  const {CookieBanner}=loadAppModule<{CookieBanner:React.ComponentType}>('src/components/CookieBanner.tsx',{
    react:hooks,'next/navigation':{usePathname:()=>'/'} ,'next/link':(p:React.ComponentProps<'a'>)=>React.createElement('a',p),
    './BrandLogo':{BrandLogo:()=>null},'./LocaleProvider':{useLocale:()=>locale},
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
test('advertising choice uses the same single dialog after age confirmation',()=>{
  const html=cookieBanner(true,true,'accepted');
  assert.equal((html.match(/<section/g)||[]).length,1);
  assert.match(html,/TrafficStars/); assert.match(html,/Decline advertising cookies/);
  assert.doesNotMatch(html,/By clicking/); assert.doesNotMatch(html,/<iframe|<script/);
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
