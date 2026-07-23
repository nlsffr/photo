"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS: { key: string; label: string }[] = [
  { key: "popular", label: "Plus vus" },
  { key: "recent", label: "Récents" },
  { key: "trending", label: "Tendances" },
  { key: "liked", label: "Plus aimés" },
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
    <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            scroll={false}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
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
  );
}
