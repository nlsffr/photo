"use client";

/**
 * Placeholder ad unit. Premium users should pass hide=true from parent.
 * Header + interstitial every N gallery items.
 */
export function AdSlot({
  variant = "banner",
  hide = false,
}: {
  variant?: "banner" | "interstitial";
  hide?: boolean;
}) {
  if (hide) return null;

  if (variant === "interstitial") {
    return (
      <div
        className="my-3 flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs text-[var(--color-ink-faint)]"
        data-ad="interstitial"
      >
        Publicité · Premium sans pub
      </div>
    );
  }

  return (
    <div
      className="mb-4 flex h-14 w-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs text-[var(--color-ink-faint)]"
      data-ad="header"
    >
      Publicité header · Premium sans pub
    </div>
  );
}
