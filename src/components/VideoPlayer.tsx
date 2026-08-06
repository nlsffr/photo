"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCount, formatDuration } from "@/lib/format";

interface Props {
  src: string;
  poster?: string;
  title?: string;
  views?: number;
  likes?: number;
  autoPlay?: boolean;
  muted?: boolean;
  className?: string;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function VideoPlayer({
  src,
  poster,
  title,
  views = 0,
  likes = 0,
  autoPlay = false,
  muted: mutedProp = true,
  className = "",
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(autoPlay);
  const [muted, setMuted] = useState(mutedProp);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

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
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch {
      /* ignore */
    }
  }, []);

  const enterFs = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.requestFullscreen) void v.requestFullscreen();
    else if ((v as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen) {
      (v as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (autoPlay) void v.play().catch(() => setPlaying(false));
  }, [autoPlay, muted, src]);

  return (
    <div className={`group relative overflow-hidden rounded-xl bg-black ${className}`}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        muted={muted}
        onTimeUpdate={onTime}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={togglePlay}
        className="h-full w-full object-contain"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={progress}
          onChange={seek}
          className="pointer-events-auto mb-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/30 accent-[var(--color-accent)]"
          aria-label="Progression"
        />
        <div className="pointer-events-auto flex items-center gap-2 text-xs text-white">
          <button type="button" onClick={togglePlay} className="rounded-full bg-white/15 px-2 py-1">
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={toggleMute} className="rounded-full bg-white/15 px-2 py-1">
            {muted ? "Unmute" : "Mute"}
          </button>
          <button type="button" onClick={cycleSpeed} className="rounded-full bg-white/15 px-2 py-1">
            {speed}x
          </button>
          <button type="button" onClick={enterPiP} className="rounded-full bg-white/15 px-2 py-1">
            PiP
          </button>
          <button type="button" onClick={enterFs} className="rounded-full bg-white/15 px-2 py-1">
            Full
          </button>
          <span className="ml-auto tabular-nums opacity-80">
            {formatDuration(Math.floor(current))} / {formatDuration(Math.floor(duration))}
          </span>
        </div>
        {(title || views || likes) && (
          <div className="mt-2 flex items-center gap-3 text-xs text-white/90">
            {title ? <span className="truncate font-medium">{title}</span> : null}
            <span className="ml-auto shrink-0">{formatCount(views)} vues · {formatCount(likes)} likes</span>
          </div>
        )}
      </div>
    </div>
  );
}
