"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Fixed back control after scroll — avoids climbing back to the top
 * just to leave a long creator / media page.
 */
export function FloatingBack({
  fallback = "/",
  preferFallback = false,
  label = "Back",
}: {
  fallback?: string;
  preferFallback?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 160);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (preferFallback) {
          router.push(fallback);
          return;
        }
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className="fixed left-3 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/95 text-[var(--color-ink)] shadow-lg backdrop-blur-md active:scale-95 sm:left-4"
      style={{
        top: "calc(3.5rem + env(safe-area-inset-top, 0px) + 0.5rem)",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
