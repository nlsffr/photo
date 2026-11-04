"use client";

import {useState, type ReactNode} from "react";
import {AdSlot} from "./AdSlot";
import {useAds} from "./AdsProvider";

/** Server-rendered recommendations keep their data, keys and order. */
export function RelatedMediaGrid({children}:{children:ReactNode}) {
  const ads=useAds();
  return <div className={`media-grid${ads.runtime?.profile==="intensive"?" media-grid-intensive":""}`}>{children}</div>;
}

export function RecommendationAdCard() {
  const ads=useAds();
  const [empty,setEmpty]=useState(false);
  if(empty||ads.runtime?.profile!=="intensive"||!ads.canServe("underVideo"))return null;
  return <div className="min-w-0" data-ad-grid-card>
    <AdSlot placement="underVideo" layout="grid" onEmpty={()=>setEmpty(true)} />
  </div>;
}

export function MediaDetailAd({videoEligible}:{videoEligible:boolean}) {
  const ads=useAds();
  if(!ads.canServe("underVideo")||(!videoEligible&&ads.runtime?.profile!=="intensive"))return null;
  return <AdSlot placement="underVideo" className={ads.runtime?.profile==="intensive"?"my-[50px]":"mt-6"} />;
}
