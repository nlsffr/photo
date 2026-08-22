"use client";

import { useRouter } from "next/navigation";

/**
 * Smart back button.
 * - Uses real browser history when possible (router.back)
 * - Only falls back to the given URL when there is no history
 * - NEVER forces preferFallback to profile (that caused the infinite loop)
 */
export function BackLink({
  fallback = "/",
  label = "Retour",
  className = "",
}: {
  fallback?: string;
  label?: string;
  className?: string;
  /** @deprecated Do not use – caused video ↔ profile infinite loop */
  preferFallback?: boolean;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        // Always prefer real history. Only push fallback if we have almost no history.
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className={`tap-lg inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] active:scale-[0.98] ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label}
    </button>
  );
}
