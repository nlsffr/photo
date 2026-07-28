"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS: { key: string | null; label: string }[] = [
  { key: null, label: "Tout" },
  { key: "0", label: "Réel" },
  { key: "1", label: "IA" },
];

export function AiFilterTabs({ basePath = "/" }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const active = searchParams.get("ai");

  function hrefFor(ai: string | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (ai === null) p.delete("ai");
    else p.set("ai", ai);
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
      {TABS.map((t) => {
        const isActive = (t.key ?? null) === (active ?? null);
        return (
          <Link
            key={t.label}
            href={hrefFor(t.key)}
            scroll={false}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
