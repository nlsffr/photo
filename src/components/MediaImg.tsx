"use client";

import Image from "next/image";

/**
 * Renders gallery media. Paths under /media/ are served by nginx→MinIO and must
 * bypass the Next.js image optimizer (which can't reach MinIO from the app container).
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
  const isLocalMedia =
    src.startsWith("/media/") ||
    src.startsWith("/media?") ||
    src.includes("://") === false && src.includes("/media/");

  if (isLocalMedia || src.startsWith("/media")) {
    if (fill) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={className}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
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
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
