"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function AdminPasswordReset() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const fragmentRead = useRef(false);
  const inFlight = useRef(false);
  const terminal = useRef(false);

  useEffect(() => {
    if (fragmentRead.current) return;
    fragmentRead.current = true;
    const fragment = window.location.hash.slice(1);
    // The bearer token remains only in memory and in the reset POST body.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (/^[a-f0-9]{64}$/.test(fragment)) setToken(fragment);
    else { terminal.current = true; setBlocked(true); setError("Ouvre le lien privé de réinitialisation qui t’a été remis. Ce lien n’est pas valide."); }
  }, []);

  function stop(message: string) {
    terminal.current = true;
    setBlocked(true); setToken(""); setPassword(""); setConfirm(""); setError(message);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || terminal.current || blocked || !token) return;
    if (password.length < 12 || password.length > 200) { setError("Choisis un mot de passe de 12 à 200 caractères."); return; }
    if (password !== confirm) { setError("Les deux mots de passe ne correspondent pas."); return; }
    inFlight.current = true; setBusy(true); setError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/admin/password/reset", {
        method:"POST", credentials:"same-origin", mode:"same-origin", redirect:"error", cache:"no-store", signal:controller.signal,
        headers:{"Content-Type":"application/json"}, body:JSON.stringify({token,password}),
      });
      if (response.status === 410) { stop("Ce lien est expiré, a déjà été utilisé ou n’est plus valide. Ouvre un nouveau lien privé, ou essaie de te connecter si tu as déjà confirmé le changement."); return; }
      if (response.status === 429) { setError("Trop de tentatives. Attends avant de réessayer. Si le lien expire, il faudra un nouveau lien privé."); return; }
      if (response.status === 400) { setError("Le mot de passe n’a pas été accepté. Choisis entre 12 et 200 caractères et vérifie la confirmation."); return; }
      if (response.status === 403) { setError("Cette demande a été refusée. Utilise le lien privé sur le site d’origine avant de réessayer."); return; }
      if (response.status !== 200) throw new Error("unconfirmed_reset");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result)
        || (result as {ok?:unknown}).ok !== true || Object.keys(result).length !== 1) throw new Error("unconfirmed_reset");
      terminal.current = true; setBlocked(true); setToken(""); setPassword(""); setConfirm("");
      // A new document reloads the freshly created authenticated session.
      window.location.replace("/admin/ads");
    } catch {
      stop("La réponse du serveur n’a pas été confirmée. Essaie de te connecter avec le mot de passe choisi avant de demander un nouveau lien.");
    } finally { window.clearTimeout(timeout); inFlight.current = false; setBusy(false); }
  }

  const input = "min-h-12 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";
  const disabled = busy || blocked || !token;
  return <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-16">
    <p className="text-sm font-semibold text-[var(--color-ink-muted)]">Administration privée</p>
    <h1 className="mt-2 text-3xl font-bold tracking-tight">Choisir un nouveau mot de passe</h1>
    <p className="mt-3 text-[var(--color-ink-muted)]">Ton mot de passe actuel reste valable jusqu’à la confirmation du changement. Les anciennes sessions seront alors déconnectées et cet appareil sera connecté avec ton nouvel accès.</p>
    <form action="/api/admin/password/reset" method="post" onSubmit={submit} className="mt-8 space-y-5">
      <label className="block" htmlFor="admin-reset-password"><span className="mb-2 block font-medium">Nouveau mot de passe</span>
        <input id="admin-reset-password" name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" aria-describedby="admin-reset-help" value={password} onChange={event => setPassword(event.target.value)} disabled={disabled} className={input} />
      </label>
      <p id="admin-reset-help" className="text-sm text-[var(--color-ink-muted)]">Entre 12 et 200 caractères. Tu peux utiliser une phrase.</p>
      <label className="block" htmlFor="admin-reset-confirm"><span className="mb-2 block font-medium">Confirmer le nouveau mot de passe</span>
        <input id="admin-reset-confirm" name="confirm" type="password" required minLength={12} maxLength={200} autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} disabled={disabled} className={input} />
      </label>
      <p role="alert" aria-live="polite" className="min-h-6 text-sm text-red-400">{error}</p>
      <button type="submit" disabled={disabled} className="min-h-12 w-full rounded-lg bg-[var(--color-accent)] px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Confirmation…" : "Confirmer mon nouveau mot de passe"}</button>
    </form>
    <Link href="/connexion?next=%2Fadmin%2Fads" className="mt-5 inline-flex min-h-12 items-center text-sm underline underline-offset-4">Essayer de me connecter</Link>
  </main>;
}
