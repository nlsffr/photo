"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/** Mobile: 3 essentiels. Desktop: tous. */
const TABS_MOBILE: { key: string; label: string }[] = [
  { key: "popular", label: "Top" },
  { key: "recent", label: "Récents" },
  { key: "trending", label: "Tendances" },
];

const TABS_DESKTOP: { key: string; label: string }[] = [
  { key: "popular", label: "Plus vus" },
  { key: "recent", label: "Récents" },
  { key: "trending", label: "Tendances" },
  { key: "liked", label: "Plus aimés" },
  { key: "longest", label: "Plus longs" },
  { key: "random", label: "Aléatoire" },
];

export function SortTabs({ basePath = "/" }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const active = searchParams.get("sort") ?? "popular";

  function hrefFor(sort: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (sort === "popular") p.delete("sort");
    else p.set("sort", sort);
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <>
      {/* Mobile simplified */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto sm:hidden">
        {TABS_MOBILE.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={hrefFor(t.key)}
              scroll={false}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                isActive
                  ? "bg-[var(--color-accent)] text-white"
                  : "border border-[var(--color-border)] text-[var(--color-ink-muted)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {/* Desktop full */}
      <div className="no-scrollbar hidden gap-2 overflow-x-auto sm:flex">
        {TABS_DESKTOP.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={hrefFor(t.key)}
              scroll={false}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${
                isActive
                  ? "bg-[var(--color-accent)] text-white"
                  : "border border-[var(--color-border)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
