"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Email + password auth form (login / signup) — the interface.
 * No backend yet: submitting shows a placeholder message. It will be wired to
 * the anonymous MariaDB backend later (passwords hashed with Argon2 server-side,
 * emails optional). Nothing is sent anywhere for now.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSignup && password !== confirm) {
      setMsg("Les mots de passe ne correspondent pas.");
      return;
    }
    setMsg(
      "Backend pas encore branché — l’interface est prête. Les comptes seront activés avec la base de données.",
    );
  }

  const input =
    "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--color-accent)]";

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
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="toi@exemple.com"
              className={input}
            />
          </label>

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
                className={input}
              />
            </label>
          )}


          <button
            type="submit"
            className="mt-2 rounded-xl bg-[var(--color-accent)] py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--color-accent-600)]"
          >
            {isSignup ? "Créer mon compte" : "Se connecter"}
          </button>

          {msg && (
            <p className="rounded-lg bg-[var(--color-surface-2)] p-3 text-center text-xs text-[var(--color-ink-muted)]">
              {msg}
            </p>
          )}
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
