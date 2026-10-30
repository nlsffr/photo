"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { localizedHref } from "@/lib/i18n/config";

const TABS: { key: string | null; labelKey: string }[] = [
  { key: null, labelKey: "aiFilters.all" },
  { key: "0", labelKey: "aiFilters.real" },
  { key: "1", labelKey: "aiFilters.ai" },
];

export function AiFilterTabs({ basePath = "/" }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const { locale, t } = useLocale();
  const effectiveBasePath = localizedHref(locale, basePath);
  const active = searchParams.get("ai");

  function hrefFor(ai: string | null) {
    const p = new URLSearchParams(searchParams.toString());
    if (ai === null) p.delete("ai");
    else p.set("ai", ai);
    const qs = p.toString();
    return qs ? `${effectiveBasePath}?${qs}` : effectiveBasePath;
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
      {TABS.map((tab) => {
        const isActive = (tab.key ?? null) === (active ?? null);
        return (
          <Link
            key={tab.key ?? "all"}
            href={hrefFor(tab.key)}
            scroll={false}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}
