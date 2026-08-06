import Link from "next/link";

/** Official mark: flame + wordmark LeakFanHub — couleurs = accent coral */
export function BrandLogo({
  href = "/",
  size = "md",
  showWord = true,
  className = "",
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  showWord?: boolean;
  className?: string;
}) {
  const box = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-10 w-10" : "h-8 w-8";
  const text = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg";

  return (
    <Link href={href} className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`relative grid ${box} shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-600)] shadow-md shadow-[var(--color-accent)]/30`}
        aria-hidden
      >
        <svg viewBox="0 0 32 32" className="h-[70%] w-[70%]" fill="none">
          <path
            d="M16 4c2 5 8 7 8 14a8 8 0 1 1-16 0c0-4 3-7 5-9 1 3 3 4 5 4-1-3-2-6-2-9z"
            fill="white"
            fillOpacity="0.95"
          />
        </svg>
      </span>
      {showWord && (
        <span className={`${text} font-black tracking-tight text-[var(--color-ink)]`}>
          Leak<span className="text-[var(--color-accent)]">FanHub</span>
        </span>
      )}
    </Link>
  );
}
