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

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div ref={wrapRef} className="relative">
      <form onSubmit={submit} className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          placeholder="Search a model, tag…"
          aria-label="Search"
          autoComplete="off"
          className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-10 pr-9 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-soft)]"
        />
        {value.length > 0 && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => {
              setValue("");
              setHits([]);
              setOpen(false);
            }}
            className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </form>

      {open && hits.length > 0 && (
        <ul className="absolute left-0 right-0 z-50 mt-1.5 max-h-72 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-2xl">
          {hits.map((h, i) => (
            <li key={h.handle}>
              <Link
                href={`/creator/${encodeURIComponent(h.handle)}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--color-surface-2)]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--color-surface-2)] text-xs font-bold">
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
                  </span>
                </span>
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                const q = value.trim();
                setOpen(false);
                router.push(
                  q ? `/recherche?q=${encodeURIComponent(q)}` : "/recherche",
                );
              }}
              className="w-full px-3 py-2 text-left text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface-2)]"
            >
              Search « {value.trim()} » →
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
