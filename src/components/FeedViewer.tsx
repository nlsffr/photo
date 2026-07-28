"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PhotoView } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { VerifiedBadge } from "./VerifiedBadge";
import { FollowPill, useInteractions } from "./Interactions";
import { MediaImg } from "./MediaImg";

function RailButton({
  icon,
  label,
  onClick,
  active,
  pressed,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className="flex flex-col items-center gap-1 text-white"
    >
      <span
        className={`grid h-11 w-11 place-items-center rounded-full backdrop-blur-sm transition-transform active:scale-90 ${
          active ? "bg-[var(--color-accent)]" : "bg-white/15"
        }`}
      >
        {icon}
      </span>
    </button>
  );
}

function FeedSlide({ item, muted }: { item: PhotoView; muted: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const { isLiked, isSaved, toggleLike, toggleSave, ready } = useInteractions();

  const liked = ready && isLiked(item.id);
  const saved = ready && isSaved(item.id);
  const likeCount = item.likes + (liked ? 1 : 0);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          el.play().then(() => setPaused(false)).catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPaused(false)).catch(() => {});
    } else {
      el.pause();
      setPaused(true);
    }
  }

  return (
    <section className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
      {item.type === "video" ? (
        <video
          ref={videoRef}
          src={item.videoUrl}
          poster={item.imageUrl}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <MediaImg
          src={item.imageUrl}
          alt={item.title}
          fill
          sizes="(max-width: 1024px) 100vw, 500px"
          className="object-cover"
        />
      )}

      {item.type === "video" && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label={paused ? "Lecture" : "Pause"}
          className="absolute inset-0 z-[5]"
        >
          {paused && (
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-black/45 ring-1 ring-white/40">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="white" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          )}
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-4 pr-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/creator/${item.creatorHandle}`} className="flex items-center gap-2">
              <MediaImg
                src={item.creator.avatarUrl || item.imageUrl}
                alt={item.creator.name}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover ring-2 ring-white/40"
              />
              <span className="flex items-center gap-1 font-bold text-white drop-shadow">
                {item.creator.name}
                {item.creator.verified && <VerifiedBadge size={14} />}
              </span>
            </Link>
            <FollowPill handle={item.creatorHandle} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-white/90 drop-shadow">
            {item.title}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-2 text-sm font-medium text-white/80">
            {item.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-3 pb-1">
          <div className="flex flex-col items-center gap-1">
            <RailButton
              label="J’aime"
              pressed={liked}
              active={liked}
              onClick={() => toggleLike(item.id)}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z" />
                </svg>
              }
            />
            <span className="text-xs font-semibold text-white drop-shadow">
              {formatCount(likeCount)}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <RailButton
              label="Enregistrer"
              pressed={saved}
              active={saved}
              onClick={() => toggleSave(item.id)}
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4Z" />
                </svg>
              }
            />
            <span className="text-xs font-semibold text-white drop-shadow">
              {saved ? "Enregistré" : "Enreg."}
            </span>
          </div>
        </div>
      </div>

      {item.type === "video" && (
        <div className="absolute inset-x-0 bottom-0 z-20 h-1 bg-white/20">
          <div
            className="h-full bg-[var(--color-accent)]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </section>
  );
}

export function FeedViewer({ items }: { items: PhotoView[] }) {
  const [muted, setMuted] = useState(true);

  return (
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-black lg:bottom-0 lg:left-60 lg:top-14">
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Activer le son" : "Couper le son"}
        className="absolute right-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm"
      >
        {muted ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
          </svg>
        )}
      </button>

      <div className="no-scrollbar mx-auto h-full max-w-[500px] snap-y snap-mandatory overflow-y-scroll">
        {items.map((item) => (
          <FeedSlide key={item.id} item={item} muted={muted} />
        ))}
      </div>
    </div>
  );
}
