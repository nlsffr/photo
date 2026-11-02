"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function SeoEditorActivation() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(fragment)) {
      setToken(fragment);
      window.history.replaceState(window.history.state, "", window.location.pathname);
    } else setError("Ouvre le lien d’activation privé qui t’a été remis.");
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token) return;
    if (password !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/seo/activate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        setError(response.status === 410
          ? "Ce lien est expiré ou a déjà été utilisé. Si ton accès est activé, connecte-toi."
          : "L’activation n’a pas abouti. Réessaie dans un instant.");
        setBusy(false); return;
      }
      router.replace("/admin/seo"); router.refresh();
    } catch { setError("La réponse du serveur n’est pas arrivée. Essaie de te connecter avec le mot de passe choisi avant de recommencer."); setBusy(false); }
  }

  const input = "min-h-12 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
  return <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
    <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Administration privée</p>
    <h1 className="mt-2 text-3xl font-bold tracking-tight">Activer ton éditeur</h1>
    <p className="mt-3 text-[var(--color-ink-muted)]">Choisis un mot de passe pour retrouver ensuite tes titres et descriptions depuis tes appareils.</p>
    <form action="/api/admin/seo/activate" method="post" onSubmit={submit} className="mt-8 space-y-5">
      <label className="block" htmlFor="seo-password"><span className="mb-2 block font-medium">Mot de passe</span>
        <input id="seo-password" name="password" type={visible ? "text" : "password"} required minLength={12} maxLength={200} autoComplete="new-password" aria-describedby="seo-password-help" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className={input}/>
      </label>
      <p id="seo-password-help" className="text-sm text-[var(--color-ink-muted)]">Au moins 12 caractères. Tu peux utiliser une phrase.</p>
      <label className="block" htmlFor="seo-confirm"><span className="mb-2 block font-medium">Confirmer le mot de passe</span>
        <input id="seo-confirm" name="confirm" type={visible ? "text" : "password"} required minLength={12} maxLength={200} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} className={input}/>
      </label>
      <button type="button" aria-pressed={visible} onClick={() => setVisible(v => !v)} className="min-h-12 text-sm underline underline-offset-4">{visible ? "Masquer les mots de passe" : "Afficher les mots de passe"}</button>
      <p role="alert" aria-live="polite" className="min-h-6 text-sm text-red-400">{error}</p>
      <button type="submit" disabled={busy || !token} className="min-h-12 w-full rounded-lg bg-[var(--color-accent)] px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Activation…" : "Activer mon accès"}</button>
    </form>
    <Link href="/connexion?next=%2Fadmin%2Fseo" className="mt-5 inline-flex min-h-12 items-center text-sm underline underline-offset-4">Mon accès est déjà activé</Link>
  </main>;
}
