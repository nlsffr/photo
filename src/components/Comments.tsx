"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  body: string;
  created_at: string;
  username?: string;
  email?: string;
};

export function Comments({ photoId }: { photoId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    fetch(`/api/comments?photoId=${encodeURIComponent(photoId)}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => undefined);
  }, [photoId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      // Anonymous placeholder user id until session is wired here
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoId,
          userId: localStorage.getItem("lumen_uid") || "",
          body: text,
        }),
      });
      if (!res.ok) throw new Error("fail");
      setText("");
      const d = await fetch(`/api/comments?photoId=${encodeURIComponent(photoId)}`).then((r) =>
        r.json(),
      );
      setItems(d.items || []);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="mb-3 font-bold">Commentaires</h3>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écrire un commentaire… (connexion requise)"
          className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          maxLength={1000}
        />
        <button
          type="submit"
          disabled={status === "loading" || text.trim().length < 2}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
      {status === "error" && (
        <p className="mb-2 text-xs text-red-400">Échec — connecte-toi pour commenter.</p>
      )}
      <ul className="space-y-3">
        {items.length === 0 && (
          <li className="text-sm text-[var(--color-ink-faint)]">Aucun commentaire.</li>
        )}
        {items.map((c) => (
          <li key={c.id} className="text-sm">
            <span className="font-semibold">{c.username || c.email || "User"}</span>
            <span className="ml-2 text-[var(--color-ink-muted)]">{c.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
