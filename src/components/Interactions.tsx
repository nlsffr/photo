"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { formatCount } from "@/lib/format";
import { useSession } from "./Session";

const KEY = "lumen:interactions:v1";

interface Ctx {
  ready: boolean;
  isLiked: (id: string) => boolean;
  isSaved: (id: string) => boolean;
  isFollowing: (handle: string) => boolean;
  toggleLike: (id: string) => void;
  toggleSave: (id: string) => void;
  toggleFollow: (handle: string) => void;
  likedIds: string[];
  savedIds: string[];
  followedHandles: string[];
  requireAuth: () => boolean;
}

const InteractionsContext = createContext<Ctx | null>(null);

function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function InteractionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setLiked(new Set<string>(d.liked ?? []));
        setSaved(new Set<string>(d.saved ?? []));
        setFollowed(new Set<string>(d.followed ?? []));
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          liked: [...liked],
          saved: [...saved],
          followed: [...followed],
        }),
      );
    } catch {
      /* ignore */
    }
  }, [liked, saved, followed, ready, user]);

  const requireAuth = useCallback(() => {
    if (user) return true;
    const next = encodeURIComponent(pathname || "/");
    router.push(`/connexion?next=${next}`);
    return false;
  }, [user, router, pathname]);

  const value: Ctx = {
    ready,
    isLiked: useCallback((id) => liked.has(id), [liked]),
    isSaved: useCallback((id) => saved.has(id), [saved]),
    isFollowing: useCallback((h) => followed.has(h), [followed]),
    toggleLike: useCallback(
      (id) => {
        if (!requireAuth()) return;
        setLiked((s) => toggle(s, id));
      },
      [requireAuth],
    ),
    toggleSave: useCallback(
      (id) => {
        if (!requireAuth()) return;
        setSaved((s) => toggle(s, id));
      },
      [requireAuth],
    ),
    toggleFollow: useCallback(
      (h) => {
        if (!requireAuth()) return;
        setFollowed((s) => toggle(s, h));
      },
      [requireAuth],
    ),
    likedIds: [...liked],
    savedIds: [...saved],
    followedHandles: [...followed],
    requireAuth,
  };

  return (
    <InteractionsContext.Provider value={value}>
      {children}
    </InteractionsContext.Provider>
  );
}

export function useInteractions(): Ctx {
  const ctx = useContext(InteractionsContext);
  if (!ctx)
    throw new Error("useInteractions must be used within InteractionsProvider");
  return ctx;
}

export function FollowButton({
  handle,
  className = "",
}: {
  handle: string;
  className?: string;
}) {
  const { isFollowing, toggleFollow, ready } = useInteractions();
  const following = ready && isFollowing(handle);
  return (
    <button
      type="button"
      onClick={() => toggleFollow(handle)}
      aria-pressed={following}
      className={`shrink-0 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
        following
          ? "border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink)]"
          : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-600)]"
      } ${className}`}
    >
      {following ? "Suivi·e" : "Suivre"}
    </button>
  );
}

export function FollowPill({ handle }: { handle: string }) {
  const { isFollowing, toggleFollow, ready } = useInteractions();
  const following = ready && isFollowing(handle);
  return (
    <button
      type="button"
      onClick={() => toggleFollow(handle)}
      aria-pressed={following}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        following
          ? "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
          : "bg-[var(--color-accent)] text-white"
      }`}
    >
      {following ? "Suivi·e" : "Suivre"}
    </button>
  );
}

export function PostActions({
  id,
  baseLikes,
}: {
  id: string;
  baseLikes: number;
}) {
  const { isLiked, isSaved, toggleLike, toggleSave, ready } = useInteractions();
  const liked = ready && isLiked(id);
  const saved = ready && isSaved(id);
  const likeCount = baseLikes + (liked ? 1 : 0);

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => toggleLike(id)}
        aria-pressed={liked}
        className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
          liked
            ? "bg-[var(--color-accent)] text-white"
            : "bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
        {formatCount(likeCount)}
      </button>
      <button
        type="button"
        onClick={() => toggleSave(id)}
        aria-pressed={saved}
        className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
          saved
            ? "bg-[var(--color-accent)] text-white"
            : "bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4Z" />
        </svg>
        {saved ? "Enregistré" : "Enregistrer"}
      </button>
    </div>
  );
}
