"use client";

import {useEffect, useRef, useState, type RefObject} from "react";
import {adsCopy} from "@/lib/ads-copy";
import {profileHasPauseBanner} from "@/lib/ads-profiles";
import {AdSlot} from "./AdSlot";
import {useAds} from "./AdsProvider";
import {useLocale} from "./LocaleProvider";

export function VideoPauseAd({video, shell, blocked = false}: {
  video: RefObject<HTMLVideoElement | null>;
  shell: RefObject<HTMLElement | null>;
  blocked?: boolean;
}) {
  const ads = useAds();
  const {locale} = useLocale();
  const [paused, setPaused] = useState(false);
  const [fits, setFits] = useState(false);
  const [closed, setClosed] = useState(false);
  const played = useRef(false);
  const nativeFullscreen = useRef(false);

  useEffect(() => {
    const element = video.current;
    const frame = shell.current;
    if (!element || !frame) return;
    const native = element as HTMLVideoElement & {webkitPresentationMode?: string; webkitDisplayingFullscreen?: boolean};
    const externalPlayback = () => nativeFullscreen.current || document.pictureInPictureElement === element
      || native.webkitPresentationMode === "picture-in-picture" || native.webkitPresentationMode === "fullscreen"
      || native.webkitDisplayingFullscreen === true;
    const hide = () => setPaused(false);
    if (blocked) hide();
    const reset = () => { played.current = false; hide(); };
    const playing = () => { if (!element.paused && !element.ended && !element.error) played.current = true; hide(); };
    const pause = () => setPaused(!blocked && played.current && element.paused && !element.ended
      && !element.error && !document.hidden && !externalPlayback());
    const visibility = () => { if (document.hidden) hide(); };
    const presentation = () => { if (externalPlayback()) hide(); };
    const beginFullscreen = () => { nativeFullscreen.current = true; hide(); };
    const endFullscreen = () => { nativeFullscreen.current = false; hide(); };
    const listeners: Array<[string, () => void]> = [
      ["playing", playing], ["play", hide], ["pause", pause], ["ended", reset],
      ["error", reset], ["emptied", reset], ["loadstart", reset],
      ["enterpictureinpicture", hide], ["webkitpresentationmodechanged", presentation],
      ["webkitbeginfullscreen", beginFullscreen], ["webkitendfullscreen", endFullscreen],
    ];
    for (const [event, listener] of listeners) element.addEventListener(event, listener);
    document.addEventListener("visibilitychange", visibility);
    const measure = () => {
      const box = frame.getBoundingClientRect();
      // 300×250 creative + shared 44px label/close row, leaving 80px for controls.
      setFits(box.width >= 316 && box.height >= 380);
    };
    measure();
    let observer: ResizeObserver | undefined;
    let pending: number | undefined;
    const resized = () => {
      if (pending !== undefined) return;
      pending = window.requestAnimationFrame(() => { pending = undefined; measure(); });
    };
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      observer.observe(frame);
    } else window.addEventListener("resize", resized);
    return () => {
      for (const [event, listener] of listeners) element.removeEventListener(event, listener);
      document.removeEventListener("visibilitychange", visibility);
      observer?.disconnect();
      window.removeEventListener("resize", resized);
      if (pending !== undefined) window.cancelAnimationFrame(pending);
    };
  }, [video, shell, blocked]);

  if (blocked || !paused || !fits || closed || !profileHasPauseBanner(ads.runtime?.profile)
    || !ads.canServe("underVideo")) return null;
  return <div className="pointer-events-none absolute inset-x-0 top-0 bottom-20 z-[7] grid place-items-center">
    <div className="pointer-events-auto relative w-[300px] rounded-lg bg-black/90">
      <AdSlot placement="underVideo" loading="eager" className="text-white [&>p]:mb-0 [&>p]:h-11 [&>p]:leading-[44px]" />
      <button type="button" aria-label={adsCopy[locale].close}
        className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-lg text-xl text-white hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
        onClick={event => { event.stopPropagation(); setClosed(true); }}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  </div>;
}
