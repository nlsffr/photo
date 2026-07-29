"use client";

import Link from "next/link";
import type { PhotoView } from "@/lib/types";
import { formatCount, formatDuration } from "@/lib/format";
import { VerifiedBadge } from "./VerifiedBadge";
import { useInteractions } from "./Interactions";
import { MediaImg } from "./MediaImg";

const SIZES =
  "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw";

export function PhotoCard({ photo }: { photo: PhotoView }) {
  const { isLiked, isSaved, toggleLike, toggleSave, ready } = useInteractions();
  const liked = ready && isLiked(photo.id);
  const saved = ready && isSaved(photo.id);
  const likeCount = photo.likes + (liked ? 1 : 0);

  const ratio = photo.width && photo.height ? photo.width / photo.height : 0.8;
  const clamped = Math.min(Math.max(ratio, 0.55), 1.4);
  const href = `/${encodeURIComponent(photo.creatorHandle)}/${encodeURIComponent(photo.id)}`;

  return (
    <div
      className="group relative w-full overflow-hidden rounded-xl bg-[var(--color-surface-2)] ring-1 ring-[var(--color-border)]"
      style={{ aspectRatio: String(clamped) }}
    >
      <Link href={href} className="absolute inset-0" aria-label={photo.title}>
        <MediaImg
          src={photo.imageUrl}
          alt={photo.title}
          fill
          sizes={SIZES}
          className="animate-fade-in object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100" />

        {photo.isAi && (
          <span className="absolute left-2 bottom-14 z-[5] rounded bg-purple-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            IA
          </span>
        )}

        {photo.type === "video" && (
          <>
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-black/45 ring-1 ring-white/40 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden>
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
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            Pack{photo.itemCount ? ` · ${photo.itemCount}` : ""}
          </span>
        )}
      </Link>

      <Link
        href={`/creator/${photo.creatorHandle}`}
        className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5"
      >
        <MediaImg
          src={photo.creator.avatarUrl || photo.imageUrl}
          alt={photo.creator.name}
          width={26}
          height={26}
          className="h-[26px] w-[26px] rounded-full object-cover object-top ring-2 ring-[var(--color-accent)]"
        />
        <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          <span className="truncate">{photo.creator.name}</span>
          {photo.creator.verified && <VerifiedBadge size={12} />}
        </span>
      </Link>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2.5 p-2.5 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => toggleLike(photo.id)}
          aria-pressed={liked}
          aria-label="J’aime"
          className="flex items-center gap-1 text-xs font-semibold text-white transition-transform active:scale-90"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={liked ? "var(--color-accent)" : "none"} stroke={liked ? "var(--color-accent)" : "currentColor"} strokeWidth="2" aria-hidden>
            <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z" />
          </svg>
          {formatCount(likeCount)}
        </button>

        <span className="flex items-center gap-1 text-xs font-medium text-white/85">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
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
          className="ml-auto text-white transition-transform active:scale-90"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={saved ? "var(--color-accent)" : "none"} stroke={saved ? "var(--color-accent)" : "currentColor"} strokeWidth="2" aria-hidden>
            <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
