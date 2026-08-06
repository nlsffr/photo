"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/Session";

type CreatorHit = { handle: string; name: string; avatarUrl: string };

export default function AddMediaPage() {
  const { user, loading } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CreatorHit[]>([]);
  const [creator, setCreator] = useState<CreatorHit | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (q.trim().length < 1 || creator) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/creators/search?q=${encodeURIComponent(q.trim())}`);
        const data = (await res.json()) as { items: CreatorHit[] };
        setHits(data.items ?? []);
      } catch {
        setHits([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, creator]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!file || !creator) {
        setStatus("Choisis un fichier et un créateur existant.");
        return;
      }
      setBusy(true);
      setStatus(null);
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("creator", creator.handle);
        fd.set("title", title);
        const res = await fetch("/api/media/upload", { method: "POST", body: fd });
        const data = (await res.json()) as { ok?: boolean; error?: string; id?: string };
        if (!res.ok || data.error) {
          setStatus(data.error || "Échec de l’envoi");
        } else {
          setStatus("Média envoyé — en attente de modération / publication.");
          setFile(null);
          setTitle("");
          setCreator(null);
          setQ("");
        }
      } catch {
        setStatus("Erreur réseau");
      } finally {
        setBusy(false);
      }
    },
    [file, creator, title],
  );

  if (loading) {
    return <p className="p-8 text-center text-sm text-[var(--color-ink-muted)]">…</p>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Ajouter un média</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Connecte-toi pour publier une photo ou une vidéo.
        </p>
        <Link
          href="/connexion?next=/add"
          className="mt-6 inline-flex rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-bold text-white"
        >
          Connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-black tracking-tight">Ajouter un média</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        Le créateur doit déjà exister dans la base (autocomplete).
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-48 rounded-lg object-contain" />
          ) : (
            <span className="text-sm text-[var(--color-ink-muted)]">
              Photo ou vidéo — clique pour choisir
            </span>
          )}
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="relative">
          <label className="text-xs font-semibold text-[var(--color-ink-faint)]">Créateur</label>
          {creator ? (
            <div className="mt-1 flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
              <span className="font-semibold">@{creator.handle}</span>
              <button
                type="button"
                className="text-xs text-[var(--color-accent)]"
                onClick={() => {
                  setCreator(null);
                  setQ("");
                }}
              >
                Changer
              </button>
            </div>
          ) : (
            <>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tape les premières lettres…"
                className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
              />
              {hits.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
                  {hits.map((h) => (
                    <li key={h.handle}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)]"
                        onClick={() => {
                          setCreator(h);
                          setHits([]);
                        }}
                      >
                        <span className="font-semibold">@{h.handle}</span>
                        <span className="text-[var(--color-ink-faint)]">{h.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--color-ink-faint)]">Titre (optionnel)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        {status && (
          <p className="text-sm text-[var(--color-ink-muted)]">{status}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-[var(--color-accent)] py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? "Envoi…" : "Publier"}
        </button>
      </form>
    </div>
  );
}
