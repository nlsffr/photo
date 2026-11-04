import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ADS_REGISTRY } from '../src/lib/ads-registry-data.mjs';
// @ts-expect-error Native Node requires the explicit suffix.
import { loadAppModule } from "./helpers/load-app-module.ts";

const hooks = {
  ...React,
  useState: (value: unknown) => [value, () => {}],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: () => {},
  useCallback: (callback: unknown) => callback,
};

function renderGallery(count: number, eligible = true, premium = false,profile:'current'|'balanced'|'intensive'='current',device:'desktop'|'mobile'='desktop',creator?:string,pathname=creator?'/example_creator':'/') {
  const placements: string[] = [];
  const { InfiniteGallery } = loadAppModule<{
    InfiniteGallery: React.ComponentType<{
      initial: { items: { id: string }[]; nextCursor: null };
      params: { sort: string; creator?: string };
      premium: boolean;
    }>;
  }>("src/components/InfiniteGallery.tsx", {
    react: {...hooks,useState:(value:unknown)=>[value==='desktop'?device:value,()=>{}]},
    'next/navigation':{usePathname:()=>pathname},
    '@/lib/ads-registry':{ADS_REGISTRY},
    "./PhotoCard": { PhotoCard: ({ photo }: { photo: { id: string } }) => React.createElement("article", { "data-media-id": photo.id }) },
    "./AdSlot": { AdSlot: ({ placement, variant, layout }: { placement?: string; variant?: string; layout?: string }) => {
      placements.push(placement ?? `legacy:${variant}`);
      return React.createElement("aside", { "data-network-ad": placement ?? "legacy", "data-slot-layout": layout });
    } },
    "./AdsProvider": { useAds: () => ({runtime:{profile}, canServe: (placement: string) => eligible && placement === "underVideo" }) },
    "./LocaleProvider": { useLocale: () => ({ t: (key: string) => key }) },
  });
  const ids = Array.from({ length: count }, (_, index) => `media-${index + 1}`);
  const html = renderToStaticMarkup(React.createElement(InfiniteGallery, {
    initial: { items: ids.map(id => ({ id })), nextCursor: null }, params: { sort: "latest", creator }, premium,
  }));
  return { html, ids, placements };
}

test("gallery ads follow media 8, 24 and 40 while every media keeps its original order", () => {
  const { html, ids, placements } = renderGallery(50);
  assert.deepEqual([...html.matchAll(/data-media-id="([^"]+)"/g)].map(match => match[1]), ids);
  const adAfter: number[] = [];
  let mediaCount = 0;
  for (const match of html.matchAll(/data-media-id="([^"]+)"|data-network-ad="([^"]+)"/g)) {
    if (match[1]) mediaCount += 1;
    else adAfter.push(mediaCount);
  }
  assert.deepEqual(adAfter, [8, 24, 40]);
  assert.deepEqual(placements, ["underVideo", "underVideo", "underVideo"]);
  assert.equal((html.match(/class="col-span-full my-1"/g) ?? []).length, 3);
});

test("a closed advertising policy creates neither network slots nor empty grid rows", () => {
  const { html, ids, placements } = renderGallery(50, false);
  assert.deepEqual(placements, []);
  assert.doesNotMatch(html, /col-span-full|data-network-ad/);
  assert.deepEqual([...html.matchAll(/data-media-id="([^"]+)"/g)].map(match => match[1]), ids);
});

test("Premium galleries and galleries with fewer than eight media contain no ad row", () => {
  for (const gallery of [renderGallery(50, true, true), renderGallery(7)]) {
    assert.deepEqual(gallery.placements, []);
    assert.doesNotMatch(gallery.html, /col-span-full|data-network-ad/);
  }
});

test('balanced and intensive select actual media positions without changing any media or duplicating mobile desktop ads',()=>{
  for(const [profile,device,expected] of [
    ['balanced','desktop',[6,18,30]],['intensive','desktop',[2,8,31]],['intensive','mobile',[2,8,31]],
  ] as const) {
    const {html,ids}=renderGallery(40,true,false,profile,device);const actual:number[]=[];let media=0;
    for(const match of html.matchAll(/data-media-id="([^"]+)"|data-network-ad="([^"]+)"/g)) {
      if(match[1])media++;else actual.push(media);
    }
    assert.deepEqual(actual,expected);assert.deepEqual([...html.matchAll(/data-media-id="([^"]+)"/g)].map(m=>m[1]),ids);
    assert.equal((html.match(/class="col-span-full my-1"/g)??[]).length,profile==='intensive'?0:expected.length);
    assert.equal((html.match(/data-slot-layout="grid"/g)??[]).length,profile==='intensive'?expected.length:0);
    const denied=renderGallery(40,false,false,profile,device);assert.deepEqual(denied.placements,[]);
  }
});

test('intensive uses the observed unbounded cadence only on home and trending, never MostLiked or unresolved routes',()=>{
  for(const pathname of ['/','/fr/trending-medias']){
    const {html}=renderGallery(80,true,false,'intensive','mobile',undefined,pathname);
    const positions:number[]=[];let media=0;
    for(const match of html.matchAll(/data-media-id="([^"]+)"|data-network-ad="([^"]+)"/g)){
      if(match[1])media++;else positions.push(media);
    }
    assert.deepEqual(positions,[2,8,31,54,77]);assert.match(html,/media-grid-intensive/);
  }
  for(const pathname of ['/most-liked','/fr/most-liked','/unresolved/path/extra']){
    assert.deepEqual(renderGallery(80,true,false,'intensive','desktop',undefined,pathname).placements,[]);
  }
});

test('intensive creator collections have no inline ad cards and preserve all media',()=>{
  for(const device of ['desktop','mobile'] as const){
    const {html,ids,placements}=renderGallery(80,true,false,'intensive',device,'example_creator');
    assert.deepEqual(placements,[]);
    assert.deepEqual([...html.matchAll(/data-media-id="([^"]+)"/g)].map(match=>match[1]),ids);
  }
});
