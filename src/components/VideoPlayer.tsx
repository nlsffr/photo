"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCount, formatDuration } from "@/lib/format";
import { mediaThumbnailUrl } from "@/lib/media-sources";
import { useLocale } from "./LocaleProvider";

interface Props {
  src: string;
  poster?: string;
  title?: string;
  views?: number;
  likes?: number;
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

export function VideoPlayer(props: Props) {
  // A new source owns fresh playback state and invalidates the previous promises.
  return <VideoPlayerSource key={props.src} {...props} />;
}

function VideoPlayerSource({
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
  const { dictionary } = useLocale();
  const copy = dictionary.video;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const playRequest = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(mutedProp);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState(false);
  const [ratio, setRatio] = useState(() => {
    if (width && height && width > 0 && height > 0) return width / height;
    return 16 / 9;
  });

  const playFailed = useCallback((reason: unknown, request: number, video: HTMLVideoElement) => {
    if (request !== playRequest.current || videoRef.current !== video) return;
    setPlaying(false);
    setBuffering(false);
    const name = reason && typeof reason === "object" && "name" in reason ? reason.name : "";
    // A replaced request or a browser autoplay policy is not a broken file.
    if (name !== "AbortError" && name !== "NotAllowedError") setError(true);
  }, []);

  const startPlayback = useCallback((reload = false) => {
    const video = videoRef.current;
    if (!video) return;
    const request = ++playRequest.current;
    setError(false);
    setBuffering(true);
    if (reload) {
      setCurrent(0);
      setProgress(0);
      video.load();
    }
    void video.play().then(() => {
      if (request !== playRequest.current || videoRef.current !== video || video.paused) return;
      setPlaying(true);
    }).catch((reason: unknown) => playFailed(reason, request, video));
  }, [playFailed]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || error) return;
    if (v.paused) {
      startPlayback();
    } else {
      playRequest.current += 1;
      v.pause();
      setPlaying(false);
      setBuffering(false);
    }
  }, [error, startPlayback]);

  const retry = useCallback(() => startPlayback(true), [startPlayback]);

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
    const v = videoRef.current;
    if (!v) return;
    const anyV = v as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitRequestFullscreen?: () => void;
    };
    try {
      if (typeof anyV.webkitEnterFullscreen === "function") {
        anyV.webkitEnterFullscreen();
        return;
      }
      const shell = shellRef.current as
        | (HTMLElement & {
            webkitRequestFullscreen?: () => void;
            msRequestFullscreen?: () => void;
          })
        | null;
      const target = shell ?? v;
      if (target.requestFullscreen) {
        void target.requestFullscreen();
      } else if (typeof (target as typeof anyV).webkitRequestFullscreen === "function") {
        (target as typeof anyV).webkitRequestFullscreen?.();
      } else if (shell?.msRequestFullscreen) {
        shell.msRequestFullscreen();
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (autoPlay) {
      const request = ++playRequest.current;
      void v.play().catch((reason: unknown) => playFailed(reason, request, v));
    }
    return () => { playRequest.current += 1; };
  }, [autoPlay, playFailed]);

  const aspectStyle = { aspectRatio: String(ratio), maxHeight: "85vh" };

  return (
    <div
      ref={shellRef}
      className={`group relative mx-auto w-full overflow-hidden rounded-2xl bg-black ${className}`}
      style={aspectStyle}
    >
      <video
        ref={videoRef}
        src={src}
        poster={mediaThumbnailUrl({ imageUrl: poster })}
        playsInline
        loop
        preload="metadata"
        muted={muted}
        onTimeUpdate={onTime}
        onWaiting={() => setBuffering(true)}
        onStalled={() => setBuffering(true)}
        onPlaying={(event) => {
          if (event.currentTarget.paused) return;
          setBuffering(false);
          setError(false);
          setPlaying(true);
        }}
        onCanPlay={() => setBuffering(false)}
        onError={() => {
          playRequest.current += 1;
          setError(true);
          setBuffering(false);
          setPlaying(false);
        }}
        onLoadedMetadata={() => {
          const v = videoRef.current;
          if (!v) return;
          setDuration(v.duration || 0);
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            setRatio(v.videoWidth / v.videoHeight);
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={togglePlay}
        className="absolute inset-0 h-full w-full object-contain"
      />

      {error && (
        <div className="absolute inset-0 z-[8] flex flex-col items-center justify-center gap-3 bg-black/80 px-4 text-center">
          <p className="text-sm font-medium text-white">{copy.errorTitle}</p>
          <p className="text-xs text-white/70">{copy.errorBody}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-white"
          >
            {copy.retry}
          </button>
        </div>
      )}

      {buffering && !error && (
        <div className="pointer-events-none absolute inset-0 z-[6] grid place-items-center bg-black/35">
          <div className="flex flex-col items-center gap-2">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <span className="text-xs font-medium text-white/90">{copy.loading}</span>
          </div>
        </div>
      )}

      {!playing && !error && !buffering && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 z-[5] grid place-items-center"
          aria-label={dictionary.feed.play}
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
          aria-label={copy.progress}
        />
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 text-white">
          <button
            type="button"
            onClick={togglePlay}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            aria-label={playing ? dictionary.feed.pause : dictionary.feed.play}
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
            aria-label={muted ? dictionary.feed.unmute : dictionary.feed.mute}
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
            aria-label={`${copy.speed}: ${speed}x`}
            className="h-9 min-w-[2.5rem] rounded-full bg-white/15 px-2 text-xs font-bold hover:bg-white/25"
          >
            {speed}x
          </button>
          <button
            type="button"
            onClick={enterPiP}
            aria-label={copy.pictureInPicture}
            title={copy.pictureInPicture}
            className="hidden h-9 rounded-full bg-white/15 px-2.5 text-xs font-semibold hover:bg-white/25 sm:inline"
          >
            PiP
          </button>
          <button
            type="button"
            onClick={enterFs}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            aria-label={copy.fullscreen}
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
              {formatCount(views)} {dictionary.mediaDetails.views} · {formatCount(likes)} {dictionary.mediaDetails.likes}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
