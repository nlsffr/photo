"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Hit = {
  handle: string;
  name: string;
  avatarUrl: string;
  followers?: number;
};

export function SearchForm({ tags }: { tags: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const activeTag = searchParams.get("tag");

  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setHits([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/creators/search?q=${encodeURIComponent(q)}`,
        );
        const data = (await res.json()) as { items: Hit[] };
        setHits(data.items ?? []);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    setOpen(false);
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
      <div ref={wrapRef} className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[var(--color-ink-faint)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        {/* type=text — pas type=search (évite la 2e croix native du navigateur) */}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          autoFocus
          placeholder="Search a model, tag, title…"
          aria-label="Search"
          autoComplete="off"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 pl-12 pr-11 text-base text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setHits([]);
              setOpen(false);
            }}
            aria-label="Clear"
            className="absolute right-3 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        {open && hits.length > 0 && (
          <ul className="absolute left-0 right-0 z-50 mt-1.5 max-h-80 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-2xl">
            {hits.map((h, i) => (
              <li key={h.handle}>
                <Link
                  href={`/creator/${encodeURIComponent(h.handle)}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-[var(--color-surface-2)]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--color-surface-2)] text-xs font-bold">
                    {h.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      h.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{h.name}</span>
                      {i < 3 && (
                        <span className="shrink-0 rounded-full bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
                          TOP
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-[var(--color-ink-faint)]">
                      @{h.handle}
                      {typeof h.followers === "number" && h.followers > 0
                        ? ` · ${h.followers.toLocaleString()} followers`
                        : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <button
                type="submit"
                className="w-full px-3 py-2.5 text-left text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]"
              >
                Search « {value.trim()} » →
              </button>
            </li>
          </ul>
        )}
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-[var(--color-accent)] py-3 text-base font-semibold text-white transition-colors hover:bg-[var(--color-accent-600)]"
      >
        Search
      </button>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        aria-expanded={advanced}
        aria-controls="recherche-avancee"
        className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
      >
        Advanced
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
            Filter by tag
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
