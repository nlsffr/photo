"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "./Session";

/**
 * Email + username + password auth form (login / signup), wired to the real
 * /api/auth backend (MariaDB sessions). Login accepts email OR username.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const { refresh } = useSession();

  const [identifier, setIdentifier] = useState(""); // login: email or username
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (isSignup && password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    try {
      const url = isSignup ? "/api/auth/register" : "/api/auth/login";
      const payload = isSignup
        ? { email, username, password }
        : { identifier, password };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (res.ok && json.ok) {
        await refresh();
        router.push("/");
        router.refresh();
      } else {
        setError(json.message ?? "Une erreur est survenue. Réessaie.");
        setBusy(false);
      }
    } catch {
      setError("Connexion impossible. Vérifie ta connexion et réessaie.");
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--color-accent)] disabled:opacity-60";

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {isSignup ? "Créer un compte" : "Connexion"}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {isSignup
            ? "Rejoins LumenGallery en quelques secondes."
            : "Content de te revoir."}
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          {isSignup ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Nom d’utilisateur</span>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  minLength={3}
                  maxLength={32}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ton_pseudo"
                  disabled={busy}
                  className={input}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">E-mail</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@exemple.com"
                  disabled={busy}
                  className={input}
                />
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">E-mail ou nom d’utilisateur</span>
              <input
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="toi@exemple.com"
                disabled={busy}
                className={input}
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Mot de passe</span>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                required
                minLength={8}
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={busy}
                className={input}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--color-ink-muted)]"
              >
                {show ? "Masquer" : "Afficher"}
              </button>
            </div>
          </label>

          {isSignup && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                Confirmer le mot de passe
              </span>
              <input
                type={show ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                disabled={busy}
                className={input}
              />
            </label>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-accent-600)] disabled:opacity-60"
          >
            {busy && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
            )}
            {busy
              ? "Un instant…"
              : isSignup
                ? "Créer mon compte"
                : "Se connecter"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--color-ink-muted)]">
          {isSignup ? (
            <>
              Déjà un compte ?{" "}
              <Link
                href="/connexion"
                className="font-semibold text-[var(--color-accent)] hover:underline"
              >
                Se connecter
              </Link>
            </>
          ) : (
            <>
              Pas encore de compte ?{" "}
              <Link
                href="/inscription"
                className="font-semibold text-[var(--color-accent)] hover:underline"
              >
                Créer un compte
              </Link>
            </>
          )}
        </p>
      </div>

      <p className="mt-4 text-center text-xs text-[var(--color-ink-faint)]">
        Tu préfères rester anonyme ?{" "}
        <Link href="/identite" className="text-[var(--color-accent)] hover:underline">
          Utilise une identité sans e-mail
        </Link>
        .
      </p>
    </div>
  );
}
