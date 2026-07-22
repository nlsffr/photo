"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS: { key: string | null; label: string }[] = [
  { key: null, label: "Tout" },
  { key: "photo", label: "Photos" },
  { key: "video", label: "Vidéos" },
];

export function MediaTypeTabs({ basePath = "/" }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const active = searchParams.get("type");

  function hrefFor(type: string | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (type) p.set("type", type);
    else p.delete("type");
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
