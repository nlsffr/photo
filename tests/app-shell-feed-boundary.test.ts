import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

function shell(pathname:string){
  const {AppShell}=loadAppModule<{AppShell:React.ComponentType<{children:React.ReactNode}>}>('src/components/AppShell.tsx',{
    react:{...React,useState:(value:unknown)=>[value,()=>{}],useEffect:()=>{}},
    'next/navigation':{usePathname:()=>pathname},'next/link':(props:React.ComponentProps<'a'>)=>React.createElement('a',props),
    './LocaleProvider':{useLocale:()=>({locale:'en',t:(key:string)=>key}),LanguageSwitcher:()=>null},
    './SearchBar':{SearchBar:()=>null},'./AccountMenu':{AccountMenu:()=>null},'./BrandLogo':{BrandLogo:()=>null},
    './AdSlot':{AdSlot:({placement}:{placement:string})=>React.createElement('aside',{'data-shell-ad':placement})},
  });
  return renderToStaticMarkup(React.createElement(AppShell,null,React.createElement('article',null,'Content')));
}

test('exact feed/tiktok routes and their child segments retain the feed shell',()=>{
  for(const pathname of ['/feed','/feed/','/feed/following','/tiktok','/tiktok/recent','/fr/feed','/ja/tiktok/following']){
    const html=shell(pathname);assert.doesNotMatch(html,/data-shell-ad|<footer/);assert.match(html,/>Content</,pathname);
  }
});

test('creator handles sharing a feed prefix and nested feed words keep normal shell slots',()=>{
  for(const pathname of ['/feedexample','/feedexample/photos','/tiktokcreator','/fr/feedexample','/zh/tiktokcreator/videos','/creator/feed']){
    const html=shell(pathname);assert.match(html,/data-shell-ad="header"/,pathname);assert.match(html,/data-shell-ad="footer"/,pathname);
    assert.match(html,/<footer/,pathname);
    const feedLinks=[...html.matchAll(/<a\b[^>]*href="\/feed"[^>]*>/g)].map(match=>match[0]);
    assert.ok(feedLinks.length>0);assert.ok(feedLinks.every(link=>!link.includes('text-[var(--color-accent)]')));
  }
});
