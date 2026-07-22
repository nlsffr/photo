"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function SearchForm({ tags }: { tags: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState("");
  const [advanced, setAdvanced] = useState(false);

  const activeTag = searchParams.get("tag");

  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/recherche?q=${encodeURIComponent(q)}` : "/recherche");
  }

  function tagHref(tag: string) {
    const params = new URLSearchParams();
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    if (tag !== activeTag) params.set("tag", tag);
    const qs = params.toString();
    return qs ? `/recherche?${qs}` : "/recherche";
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          placeholder="Rechercher un modèle, un tag, un titre…"
          aria-label="Rechercher"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 pl-12 pr-11 text-base text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Effacer"
            className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-[var(--color-accent)] py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-600)]"
      >
        Rechercher
      </button>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        aria-expanded={advanced}
        aria-controls="recherche-avancee"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 7l4 5 5-7 5 7 4-5v11H3z" />
        </svg>
        Recherche avancée
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`transition-transform ${advanced ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {advanced && (
        <div
          id="recherche-avancee"
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
            Filtrer par tag
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const isActive = tag === activeTag;
              return (
                <Link
                  key={tag}
                  href={tagHref(tag)}
                  className={`rounded-full border px-3 py-1.5 text-sm capitalize transition-colors ${
                    isActive
                      ? "border-transparent bg-[var(--color-accent)] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  #{tag}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </form>
  );
}
