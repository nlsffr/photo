"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { PhotoView } from "@/lib/types";
import { creatorHref, mediaHref } from "@/lib/types";
import { formatCount, formatDuration } from "@/lib/format";
import { VerifiedBadge } from "./VerifiedBadge";
import { useInteractions } from "./Interactions";
import { MediaImg } from "./MediaImg";

const SIZES =
  "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw";

const PREVIEW_MAX_SEC = 8;

const CARD_RATIO = "4 / 5";

export function PhotoCard({
  photo,
  /** Use history.replace so media→media doesn't stack back history. */
  replace = false,
}: {
  photo: PhotoView;
  replace?: boolean;
}) {
  const { isLiked, isSaved, toggleLike, toggleSave, ready } = useInteractions();
  const liked = ready && isLiked(photo.id);
  const saved = ready && isSaved(photo.id);
  const likeCount = photo.likes + (liked ? 1 : 0);

  const href = mediaHref(photo);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovering, setHovering] = useState(false);
  const isVideo = photo.type === "video" && !!photo.videoUrl;

  const onEnter = () => {
    if (!isVideo) return;
    setHovering(true);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.muted = true;
    void v.play().catch(() => undefined);
  };

  const onLeave = () => {
    setHovering(false);
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime >= PREVIEW_MAX_SEC) v.currentTime = 0;
  };

  return (
    <div
      className="group relative isolate w-full overflow-hidden rounded-xl bg-[var(--color-surface-2)]"
      style={{ aspectRatio: CARD_RATIO }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <Link
        href={href}
        replace={replace}
        className="absolute inset-0 overflow-hidden rounded-xl"
        aria-label={photo.title}
      >
        <MediaImg
          src={photo.imageUrl}
          alt={photo.title}
          fill
          sizes={SIZES}
          className={`animate-fade-in object-cover object-center transition-opacity duration-300 ${hovering && isVideo ? "opacity-0" : "opacity-100"}`}
        />

        {isVideo && (
          <video
            ref={videoRef}
            src={photo.videoUrl}
            muted
            playsInline
            preload="none"
            loop
            onTimeUpdate={onTimeUpdate}
            className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300 ${hovering ? "opacity-100" : "opacity-0"}`}
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent sm:opacity-0 sm:group-hover:opacity-100" />

        {photo.isAi && (
          <span className="absolute bottom-12 left-2 z-[5] rounded bg-purple-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            IA
          </span>
        )}

        {isVideo && !hovering && (
          <>
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-black/45 ring-1 ring-white/35 backdrop-blur-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
            <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {formatDuration(photo.durationSec ?? 0)}
            </span>
          </>
        )}

        {photo.type === "pack" && (
          <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            Pack{photo.itemCount ? ` · ${photo.itemCount}` : ""}
          </span>
        )}
      </Link>

      <Link
        href={creatorHref(photo.creatorHandle)}
        className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-0.75rem)] items-center gap-1.5"
      >
        <MediaImg
          src={photo.creator.avatarUrl || photo.imageUrl}
          alt={photo.creator.name}
          width={24}
          height={24}
          className="h-6 w-6 rounded-full object-cover object-top ring-2 ring-white/80"
        />
        <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-white drop-shadow">
          <span className="truncate">{photo.creator.name}</span>
          {photo.creator.verified && <VerifiedBadge size={11} />}
        </span>
      </Link>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 p-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => toggleLike(photo.id)}
          aria-pressed={liked}
          aria-label="J’aime"
          className="flex items-center gap-1 text-xs font-semibold text-white active:scale-90"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={liked ? "var(--color-accent)" : "none"} stroke={liked ? "var(--color-accent)" : "currentColor"} strokeWidth="2" aria-hidden>
            <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z" />
          </svg>
          {formatCount(likeCount)}
        </button>

        <span className="flex items-center gap-1 text-xs text-white/85">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {formatCount(photo.views)}
        </span>

        <button
          type="button"
          onClick={() => toggleSave(photo.id)}
          aria-pressed={saved}
          aria-label="Enregistrer"
          className="ml-auto text-white active:scale-90"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "var(--color-accent)" : "none"} stroke={saved ? "var(--color-accent)" : "currentColor"} strokeWidth="2" aria-hidden>
            <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
