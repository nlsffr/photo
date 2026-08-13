"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Filtres type bibliothèque — labels explicites partout (mobile + desktop).
 * Clés API inchangées: popular | recent | trending | liked | longest | random
 */
const TABS: { key: string; label: string; short?: string }[] = [
  { key: "popular", label: "Plus vus", short: "Plus vus" },
  { key: "liked", label: "Plus aimés", short: "Aimés" },
  { key: "recent", label: "Récents", short: "Récents" },
  { key: "trending", label: "Tendances", short: "Tendance" },
  { key: "longest", label: "Plus longs", short: "Longs" },
  { key: "random", label: "Aléatoire", short: "Random" },
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
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            scroll={false}
            title={t.label}
            className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold sm:px-4 sm:py-1.5 ${
              isActive
                ? "bg-[var(--color-accent)] text-white"
                : "border border-[var(--color-border)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            <span className="sm:hidden">{t.short ?? t.label}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
