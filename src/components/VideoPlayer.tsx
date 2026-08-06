"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCount, formatDuration } from "@/lib/format";

interface Props {
  src: string;
  poster?: string;
  title?: string;
  views?: number;
  likes?: number;
  /** Original media dimensions — used to size the player correctly */
  width?: number;
  height?: number;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function VideoPlayer({
  src,
  poster,
  title,
  views = 0,
  likes = 0,
  width,
  height,
  autoPlay = false,
  muted: mutedProp = false,
  className = "",
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(autoPlay);
  const [muted, setMuted] = useState(mutedProp);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [natural, setNatural] = useState({ w: width ?? 0, h: height ?? 0 });

  const isVertical =
    natural.w > 0 && natural.h > 0 ? natural.h > natural.w : (height ?? 16) > (width ?? 9);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const cycleSpeed = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const i = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    const next = SPEEDS[(i + 1) % SPEEDS.length]!;
    v.playbackRate = next;
    setSpeed(next);
  }, [speed]);

  const onTime = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setCurrent(v.currentTime);
    setProgress((v.currentTime / v.duration) * 100);
  }, []);

  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const t = (Number(e.target.value) / 100) * v.duration;
    v.currentTime = t;
    setProgress(Number(e.target.value));
  }, []);

  const enterPiP = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* ignore */
    }
  }, []);

  const enterFs = useCallback(() => {
    const el = shellRef.current ?? videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) void el.requestFullscreen();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (autoPlay) void v.play().catch(() => setPlaying(false));
  }, [autoPlay, muted, src]);

  // Vertical on desktop: centered column max ~min(80vh, 420px wide)
  // Horizontal: full width, max 80vh
  const frameClass = isVertical
    ? "mx-auto flex w-full max-w-[min(100%,420px)] items-center justify-center"
    : "w-full";

  return (
    <div
      ref={shellRef}
      className={`group relative overflow-hidden rounded-2xl bg-black ${frameClass} ${className}`}
      style={{
        aspectRatio:
          natural.w > 0 && natural.h > 0
            ? `${natural.w} / ${natural.h}`
            : isVertical
              ? "9 / 16"
              : "16 / 9",
        maxHeight: "min(80vh, 900px)",
      }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        muted={muted}
        onTimeUpdate={onTime}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (!v) return;
          setDuration(v.duration || 0);
          if (v.videoWidth && v.videoHeight) {
            setNatural({ w: v.videoWidth, h: v.videoHeight });
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={togglePlay}
        className="absolute inset-0 h-full w-full object-contain bg-black"
      />

      {/* Big center play when paused */}
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 z-[5] grid place-items-center"
          aria-label="Lecture"
        >
          <span className="grid h-16 w-16 place-items-center rounded-full bg-black/50 ring-1 ring-white/40 backdrop-blur-sm">
            <Icon d="M8 5v14l11-7z" size={28} />
          </span>
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-3 pt-10 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={progress}
          onChange={seek}
          className="pointer-events-auto mb-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-[var(--color-accent)]"
          aria-label="Progression"
        />
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 text-white">
          <button
            type="button"
            onClick={togglePlay}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Icon d="M6 5h4v14H6zM14 5h4v14h-4z" size={16} />
            ) : (
              <Icon d="M8 5v14l11-7z" size={16} />
            )}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            aria-label={muted ? "Son" : "Muet"}
          >
            {muted ? (
              <Icon d="M11 5 6 9H2v6h4l5 4V5zm10 4-6 6m0-6 6 6" size={16} />
            ) : (
              <Icon d="M11 5 6 9H2v6h4l5 4V5zm4.5 3.5a5 5 0 010 7M19 5a9 9 0 010 14" size={16} />
            )}
          </button>
          <button
            type="button"
            onClick={cycleSpeed}
            className="h-9 min-w-[2.5rem] rounded-full bg-white/15 px-2 text-xs font-bold hover:bg-white/25"
          >
            {speed}x
          </button>
          <button
            type="button"
            onClick={enterPiP}
            className="hidden h-9 rounded-full bg-white/15 px-2.5 text-xs font-semibold hover:bg-white/25 sm:inline"
          >
            PiP
          </button>
          <button
            type="button"
            onClick={enterFs}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            aria-label="Plein écran"
          >
            <Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" size={16} />
          </button>
          <span className="ml-auto text-[11px] tabular-nums text-white/80">
            {formatDuration(Math.floor(current))} / {formatDuration(Math.floor(duration))}
          </span>
        </div>
        {(title || views || likes) && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/85">
            {title ? <span className="truncate font-medium">{title}</span> : null}
            <span className="ml-auto shrink-0">
              {formatCount(views)} vues · {formatCount(likes)} likes
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
