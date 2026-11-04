"use client";

import {useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type RefObject} from "react";
import {usePathname} from "next/navigation";
import {adsCopy} from "@/lib/ads-copy";
import type {Locale} from "@/lib/i18n/config";
import {useAds} from "./AdsProvider";
import {useLocale} from "./LocaleProvider";

export type VideoAdMode = "preroll" | "postroll";
export type VideoPrerollControl = {request: (mode?: VideoAdMode) => boolean; cancel: () => void};
type Attempt = {mode: VideoAdMode; nonce: string; revision: number; path: string; locale: Locale; device: "mobile" | "desktop"};

/** Only the media-page player mounts this controller. Both modes require the first user Play before making a request. */
export function VideoPrerollAd({controller, shell, onFinish}: {
  controller: RefObject<VideoPrerollControl | null>;
  shell: RefObject<HTMLElement | null>;
  onFinish: (resume: boolean, mode: VideoAdMode) => void;
}) {
  const ads = useAds();
  const {locale} = useLocale();
  const path = usePathname();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const frame = useRef<HTMLIFrameElement | null>(null);
  const attempted = useRef({preroll:false, postroll:false});
  const activated = useRef(false);
  const active = useRef<Attempt | null>(null);
  const live = useRef(false);
  const deadline = useRef<number | undefined>(undefined);
  const filled = useRef(false);
  const sendVisibility = useRef<(() => void) | undefined>(undefined);
  const latest = useRef({ads, path, locale, onFinish, shell});
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  useEffect(() => { latest.current = {ads, path, locale, onFinish, shell}; }, [ads, path, locale, onFinish, shell]);

  const visible = useCallback(() => {
    const box = latest.current.shell.current?.getBoundingClientRect();
    if (!box || document.hidden || box.width <= 0 || box.height <= 0) return false;
    const width = Math.max(0, Math.min(box.right, window.innerWidth) - Math.max(box.left, 0));
    const height = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
    return width * height >= box.width * box.height * .5;
  }, []);
  const permitted = useCallback((value: Attempt) => {
    const current = latest.current;
    return current.ads.runtime?.profile === "intensive" && current.ads.runtime.revision === value.revision
      && current.path === value.path && current.ads.canServe("underVideo");
  }, []);
  const finish = useCallback((resume: boolean, expected?: Attempt) => {
    const current = active.current;
    if (!current || (expected && current !== expected)) return;
    active.current = null;
    window.clearTimeout(deadline.current);
    deadline.current = undefined;
    // Stop the child before removing it; no terminal can resume twice.
    frame.current?.contentWindow?.postMessage({type:"lfh-ad-visibility", placement:"underVideo", context:current.mode,
      nonce:current.nonce, activated:true, visible:false}, location.origin);
    if (!live.current) return;
    setAttempt(null);
    latest.current.onFinish(resume && permitted(current) && visible(), current.mode);
  }, [permitted, visible]);

  useImperativeHandle(controller, () => ({
    request(mode = "preroll") {
      if (!live.current || (mode === "postroll" && !activated.current)) return false;
      if (active.current) return active.current.mode === mode;
      if (attempted.current[mode]) return false;
      attempted.current[mode] = true;
      if (mode === "preroll") activated.current = true;
      const current = latest.current;
      if (current.ads.runtime?.profile !== "intensive" || !current.ads.canServe("underVideo") || !visible()) return false;
      const value: Attempt = {mode, nonce:`lfh-${mode}-${id}-${current.ads.runtime.revision}`, revision:current.ads.runtime.revision,
        path:current.path, locale:current.locale, device:matchMedia("(min-width: 1024px)").matches ? "desktop" : "mobile"};
      active.current = value;
      filled.current = false;
      setAttempt(value);
      return true;
    },
    cancel() { finish(false); },
  }), [finish, id, visible]);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      window.clearTimeout(deadline.current);
      active.current = null;
      sendVisibility.current = undefined;
    };
  }, []);

  const eligible = ads.runtime?.profile === "intensive" && ads.canServe("underVideo");
  useEffect(() => {
    if (attempt && (!eligible || ads.runtime?.revision !== attempt.revision || path !== attempt.path)) finish(false, attempt);
  }, [attempt, eligible, ads.runtime?.revision, path, finish]);

  useEffect(() => {
    const element = frame.current;
    if (!attempt || !element) return;
    let disposed = false, marked = false;
    const post = (value: boolean) => element.contentWindow?.postMessage({type:"lfh-ad-visibility", placement:"underVideo",
      context:attempt.mode, nonce:attempt.nonce, activated:true, visible:value}, location.origin);
    const update = () => {
      if (disposed || active.current !== attempt) return;
      if (!visible() || !permitted(attempt)) { finish(false, attempt); return; }
      if (!marked) {
        if (!latest.current.ads.markSdkStarted(attempt.device)) { finish(false, attempt); return; }
        marked = true;
      }
      post(true);
    };
    const message = (event: MessageEvent) => {
      if (disposed || active.current !== attempt || event.origin !== location.origin || event.source !== element.contentWindow
        || event.data?.type !== "lfh-ad-status" || event.data?.placement !== "underVideo"
        || event.data?.context !== attempt.mode || event.data?.nonce !== attempt.nonce) return;
      if (!permitted(attempt) || !visible()) { finish(false, attempt); return; }
      if (event.data.status === "filled" && !filled.current) {
        filled.current = true;
        window.clearTimeout(deadline.current);
        deadline.current = window.setTimeout(() => finish(true, attempt), 125_000);
      } else if (["ended", "empty", "skipped"].includes(event.data.status)) finish(true, attempt);
    };
    const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(entries => {
      const entry = entries.find(value => value.target === element);
      if (entry && (!entry.isIntersecting || entry.intersectionRatio < .5)) finish(false, attempt);
      else update();
    }, {threshold:[0, .5]});
    observer?.observe(element);
    sendVisibility.current = update;
    deadline.current = window.setTimeout(() => finish(true, attempt), 15_000);
    window.addEventListener("message", message);
    const pagehide = () => finish(false, attempt);
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("visibilitychange", update);
    // Geometric checks also support browsers without IntersectionObserver.
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, {passive:true});
    return () => {
      disposed = true; post(false); observer?.disconnect();
      sendVisibility.current = undefined;
      window.clearTimeout(deadline.current); deadline.current = undefined;
      window.removeEventListener("message", message);
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [attempt, finish, permitted, visible]);

  if (!attempt || !eligible || path !== attempt.path || ads.runtime?.revision !== attempt.revision) return null;
  const query = new URLSearchParams({nonce:attempt.nonce, path:attempt.path, locale:attempt.locale, device:attempt.device});
  return <div className="absolute inset-0 z-[46] bg-black" data-video-preroll={attempt.mode === "preroll" || undefined}
    data-video-postroll={attempt.mode === "postroll" || undefined}>
    <iframe key={attempt.nonce} ref={frame} src={`/api/ads/${attempt.mode}?${query}`} title={adsCopy[attempt.locale].label} loading="eager"
      allow="autoplay" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer" className="block h-full w-full border-0"
      onLoad={() => sendVisibility.current?.()} onError={() => finish(true, attempt)} />
  </div>;
}
