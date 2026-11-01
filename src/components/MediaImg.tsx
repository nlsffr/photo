"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { normalizeMediaSources } from "@/lib/types";

const RETRY_DELAYS = [30_000, 120_000, 300_000] as const;

function ownMediaUrl(source: string): URL | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const url = new URL(source, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith("/media/")) return url;
  } catch { /* An invalid or external URL is not an automatic retry target. */ }
  return undefined;
}

type SourceState = { key: string; index: number; retries: number; failedAt: number; retryAt: number };
function initialState(key: string): SourceState {
  return { key, index: 0, retries: 0, failedAt: 0, retryAt: 0 };
}

/**
 * Gallery media. /media/* bypasses Next optimizer (nginx → B2).
 * On 403/404 shows a neutral placeholder (never BrandLogo).
 */
export function MediaImg({
  src,
  fallbackSrc,
  alt,
  fill,
  width,
  height,
  sizes,
  className,
  priority,
}: {
  src: string;
  fallbackSrc?: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  const sources = normalizeMediaSources(src, fallbackSrc);
  const sourceKey = sources.join("\u0000");
  const [sourceState, setSourceState] = useState(() => initialState(sourceKey));
  const state = sourceState.key === sourceKey ? sourceState : initialState(sourceKey);
  // Signed external assets keep their normal first attempt/fallback, never retries.
  const candidates = state.retries > 0 ? sources.filter((source) => ownMediaUrl(source)) : sources;
  const safeSrc = candidates[state.index] || "";
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  let requestSrc = safeSrc;
  if (state.retries > 0 && safeSrc) {
    const url = ownMediaUrl(safeSrc);
    if (url) {
      url.searchParams.set("_lfh_retry", `${state.retries}-${state.retryAt}`);
      requestSrc = safeSrc.startsWith("/") ? `${url.pathname}${url.search}${url.hash}` : url.href;
    }
  }
  const imageKey = `${sourceKey}|${state.retries}|${state.index}`;
  const tryNextSource = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget !== imageRef.current) return;
    setSourceState((current) => {
      const value = current.key === sourceKey ? current : initialState(sourceKey);
      const count = value.retries > 0 ? sources.filter((source) => ownMediaUrl(source)).length : sources.length;
      const index = value.index + 1;
      return { ...value, index, failedAt: index >= count ? Date.now() : 0 };
    });
  };

  useEffect(() => {
    if (safeSrc || !state.failedAt || state.retries >= RETRY_DELAYS.length) return;
    if (!sourceKey.split("\u0000").some((source) => ownMediaUrl(source))) return;
    const placeholder = placeholderRef.current;
    if (!placeholder) return;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const ready = () => visible && document.visibilityState === "visible" && navigator.onLine !== false;
    const schedule = () => {
      clear();
      if (!ready()) return;
      const due = state.failedAt + RETRY_DELAYS[state.retries];
      timer = setTimeout(() => {
        timer = undefined;
        if (!ready()) return;
        setSourceState((current) => {
          if (current.key !== sourceKey || current.retries !== state.retries || current.failedAt !== state.failedAt) return current;
          return { ...current, index: 0, retries: current.retries + 1, failedAt: 0, retryAt: Date.now() };
        });
      }, Math.max(0, due - Date.now()));
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting === true;
      schedule();
    });
    observer.observe(placeholder);
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("online", schedule);
    window.addEventListener("offline", schedule);
    return () => {
      clear(); observer.disconnect();
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", schedule);
    };
  }, [sourceKey, safeSrc, state.failedAt, state.retries]);
  const isLocalMedia =
    safeSrc.startsWith("/media/") ||
    safeSrc.startsWith("/media?") ||
    (!safeSrc.includes("://") && safeSrc.includes("/media/"));

  if (!safeSrc) {
    if (fill) {
      return (
        <div
          ref={placeholderRef}
          className={`absolute inset-0 grid place-items-center bg-[var(--color-surface-2)] text-[var(--color-ink-faint)] ${className || ""}`}
          aria-hidden
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </div>
      );
    }
    return (
      <div
        ref={placeholderRef}
        className={`grid place-items-center bg-[var(--color-surface-2)] text-[var(--color-ink-faint)] ${className || ""}`}
        style={{ width: width || 48, height: height || 48 }}
        aria-hidden
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    );
  }

  if (isLocalMedia || safeSrc.startsWith("/media")) {
    if (fill) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imageKey}
          ref={imageRef}
          src={requestSrc}
          alt={alt}
          className={className}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={tryNextSource}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={imageKey}
        ref={imageRef}
        src={requestSrc}
        alt={alt}
        width={width}
        height={height}
        className={className}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onError={tryNextSource}
      />
    );
  }

  return (
    <Image
      key={imageKey}
      ref={imageRef}
      src={requestSrc}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      className={className}
      priority={priority}
      unoptimized
      onError={tryNextSource}
    />
  );
}
