"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PhotoView } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { VerifiedBadge } from "./VerifiedBadge";

function ActionButton({
  icon,
  label,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  action: string;
}) {
  return (
    <button
      aria-label={label && label !== action ? `${action}, ${label}` : action}
      className="flex flex-col items-center gap-1 text-white"
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur-sm transition-transform active:scale-90">
        {icon}
      </span>
      <span className="text-xs font-semibold drop-shadow">{label}</span>
    </button>
  );
}

function FeedSlide({ item }: { item: PhotoView }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
      {/* Media */}
      {item.type === "video" ? (
        <video
          ref={videoRef}
          src={item.videoUrl}
          poster={item.imageUrl}
          muted
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <Image
          src={item.imageUrl}
          alt={item.title}
          fill
          sizes="(max-width: 1024px) 100vw, 500px"
          className="object-cover"
        />
      )}

      {/* Scrims */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Caption (bottom-left) */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 pr-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/creator/${item.creatorHandle}`}
            className="flex items-center gap-2"
          >
            <Image
              src={item.creator.avatarUrl}
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
          <p className="mt-2 line-clamp-2 text-sm text-white/90 drop-shadow">
            {item.title}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-2 text-sm font-medium text-white/80">
            {item.tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        </div>

        {/* Action rail */}
        <div className="flex shrink-0 flex-col items-center gap-4 pb-1">
          <ActionButton
            action="J’aime"
            label={formatCount(item.likes)}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2 5 5.4 5c2 0 3.3 1.1 4.6 2.6C11.3 6.1 12.6 5 14.6 5 18 5 19.6 8.4 22 11.7 19.5 16.4 12 21 12 21Z" />
              </svg>
            }
          />
          <ActionButton
            action="Commentaires"
            label={formatCount(Math.floor(item.likes / 8))}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
          />
          <ActionButton
            action="Partager"
            label="Partager"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
              </svg>
            }
          />
        </div>
      </div>
    </section>
  );
}

export function FeedViewer({ items }: { items: PhotoView[] }) {
  return (
    <div className="fixed bottom-16 left-0 right-0 top-14 z-30 bg-black lg:bottom-0 lg:left-60">
      <div className="no-scrollbar mx-auto h-full max-w-[500px] snap-y snap-mandatory overflow-y-scroll">
        {items.map((item) => (
          <FeedSlide key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
