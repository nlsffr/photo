import Image from "next/image";
import Link from "next/link";
import type { PhotoView } from "@/lib/types";
import { formatCount, formatDuration } from "@/lib/format";
import { VerifiedBadge } from "./VerifiedBadge";

const SIZES =
  "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw";

export function PhotoCard({ photo }: { photo: PhotoView }) {
  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-xl bg-[var(--color-surface-2)] ring-1 ring-[var(--color-border)]">
      {/* Whole-card link to the photo */}
      <Link href={`/photo/${photo.id}`} className="absolute inset-0" aria-label={photo.title}>
        <Image
          src={photo.imageUrl}
          alt={photo.title}
          fill
          sizes={SIZES}
          className="animate-fade-in object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Top + bottom scrims for legibility */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

        {/* Video affordances */}
        {photo.type === "video" && (
          <>
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-black/45 ring-1 ring-white/40 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
            <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {formatDuration(photo.durationSec ?? 0)}
            </span>
          </>
        )}
      </Link>

      {/* Creator badge (top-left) — links to the creator */}
      <Link
        href={`/creator/${photo.creatorHandle}`}
        className="absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5"
      >
        <Image
          src={photo.creator.avatarUrl}
          alt={photo.creator.name}
          width={26}
          height={26}
          className="h-[26px] w-[26px] rounded-full object-cover ring-2 ring-[var(--color-accent)]"
        />
        <span className="flex min-w-0 items-center gap-1 text-sm font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          <span className="truncate">{photo.creator.name}</span>
          {photo.creator.verified && <VerifiedBadge size={12} />}
        </span>
      </Link>

      {/* Hover stats (bottom) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center gap-3 p-2 text-xs font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {formatCount(photo.views)}
        </span>
        <span className="flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z" />
          </svg>
          {formatCount(photo.likes)}
        </span>
      </div>
    </div>
  );
}
