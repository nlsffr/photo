"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./Session";
import { useLocale } from "./LocaleProvider";
import { localizedHref } from "@/lib/i18n/config";

type Item = {
  id: string;
  body: string;
  created_at: string;
  username?: string | null;
};

async function loadComments(photoId: string, signal: AbortSignal): Promise<Item[]> {
  const response = await fetch(
    `/api/comments?photoId=${encodeURIComponent(photoId)}`,
    { signal },
  );
  if (!response.ok) throw new Error("comments_unavailable");
  const data = await response.json();
  if (!Array.isArray(data.items)) throw new Error("invalid_comments_response");
  return data.items;
}

export function Comments({ photoId }: { photoId: string }) {
  const { user } = useSession();
  const { locale, dictionary } = useLocale();
  const copy = dictionary.comments;
  const pathname = usePathname();
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoadStatus("loading");
    setItems([]);
    loadComments(photoId, controller.signal)
      .then((comments) => {
        if (!current) return;
        setItems(comments);
        setLoadStatus("ready");
      })
      .catch(() => {
        if (current) setLoadStatus("error");
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [photoId, reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId, body: text }),
      });
      if (!res.ok) throw new Error("fail");
      setText("");
      setStatus("idle");
      setReload((value) => value + 1);
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="mb-3 font-bold">{copy.title}</h3>
      {user ? (
        <form onSubmit={submit} className="mb-4 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={status === "loading" || text.trim().length < 2}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {copy.submit}
          </button>
        </form>
      ) : (
        <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
          <Link
            href={`${localizedHref(locale, "/connexion")}?next=${encodeURIComponent(pathname || "/")}`}
            className="font-semibold text-[var(--color-accent)] underline"
          >
            {copy.login}
          </Link>{" "}
          {copy.loginSuffix}
        </p>
      )}
      {status === "error" && (
        <p className="mb-2 text-xs text-red-400">{copy.sendError}</p>
      )}
      {loadStatus === "loading" && (
        <p className="text-sm text-[var(--color-ink-faint)]">
          {copy.loading}
        </p>
      )}
      <div aria-live="polite">
        {loadStatus === "error" && (
          <p className="text-sm text-[var(--color-ink-muted)]">
            {copy.loadError}{" "}
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
              className="font-semibold text-[var(--color-accent)] underline"
            >
              {copy.retry}
            </button>
          </p>
        )}
      </div>
      {loadStatus === "ready" && (
        <ul className="space-y-3">
          {items.length === 0 && (
            <li className="text-sm text-[var(--color-ink-faint)]">
              {copy.empty}
            </li>
          )}
          {items.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-semibold">{c.username || copy.user}</span>
              <span className="ml-2 text-[var(--color-ink-muted)]">{c.body}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
