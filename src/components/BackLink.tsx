"use client";

import { useRouter } from "next/navigation";

/** Prefer browser history; fallback to href if no history entry. */
export function BackLink({
  fallback = "/",
  label = "Retour",
  className = "",
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className={`inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] ${className}`}
    >
      ← {label}
    </button>
  );
}
