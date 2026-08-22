"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Gallery media. /media/* bypasses Next optimizer (nginx → B2).
 * On 403/404 shows a neutral placeholder (never BrandLogo).
 */
export function MediaImg({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  className,
  priority,
}: {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const safeSrc = (src || "").trim();
  const isLocalMedia =
    safeSrc.startsWith("/media/") ||
    safeSrc.startsWith("/media?") ||
    (!safeSrc.includes("://") && safeSrc.includes("/media/"));

  if (!safeSrc || failed) {
    if (fill) {
      return (
        <div
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
          src={safeSrc}
          alt={alt}
          className={className}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
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
        src={safeSrc}
        alt={alt}
        width={width}
        height={height}
        className={className}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <Image
      src={safeSrc}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      className={className}
      priority={priority}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
