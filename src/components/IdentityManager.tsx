"use client";

import { useState } from "react";
import { useAnonIdentity } from "./AnonIdentity";

export function IdentityManager() {
  const { ready, handle, secret, regenerate, restore, forget } =
    useAnonIdentity();
  const [reveal, setReveal] = useState(false);
  const [importVal, setImportVal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!ready) {
    return (
      <div className="h-40 animate-pulse rounded-2xl bg-[var(--color-surface-2)]" />
    );
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setMsg("Copié dans le presse-papiers");
      setTimeout(() => setMsg(null), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Public handle */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Ton identité publique
        </h2>
        <p className="mt-2 break-all font-mono text-sm text-[var(--color-ink)]">
          {handle || "—"}
        </p>
        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
          C’est la seule chose que le serveur peut voir. Elle ne contient aucune
          information personnelle et ne peut pas remonter jusqu’à toi.
        </p>
      </section>

      {/* Secret key */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Ta clé secrète
        </h2>
        <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
          Elle reste <strong>uniquement sur cet appareil</strong>. Sauvegarde-la
          pour te reconnecter ailleurs. Personne ne peut la récupérer à ta place
          — pas d’email, pas de mot de passe oublié.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 break-all rounded-lg bg-[var(--color-surface-2)] p-3 font-mono text-xs">
            {reveal ? secret : "•".repeat(64)}
          </code>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setReveal((v) => !v)}
            className="rounded-full bg-[var(--color-surface-2)] px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface-3)]"
          >
            {reveal ? "Masquer" : "Afficher"}
          </button>
          <button
            onClick={() => copy(secret)}
            className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
          >
            Copier ma clé
          </button>
        </div>
      </section>

      {/* Restore */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
          Restaurer une identité
        </h2>
        <input
          value={importVal}
          onChange={(e) => setImportVal(e.target.value)}
          placeholder="Colle ta clé secrète (64 caractères)"
          className="mt-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 font-mono text-xs outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={() => {
            const ok = restore(importVal);
            setMsg(ok ? "Identité restaurée" : "Clé invalide");
            if (ok) setImportVal("");
            setTimeout(() => setMsg(null), 2500);
          }}
          className="mt-3 rounded-full bg-[var(--color-surface-2)] px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface-3)]"
        >
          Restaurer
        </button>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-red-400">
          Zone sensible
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => {
              if (confirm("Générer une nouvelle identité ? L’ancienne sera perdue si tu ne l’as pas sauvegardée.")) {
                regenerate();
                setMsg("Nouvelle identité générée");
                setTimeout(() => setMsg(null), 2500);
              }
            }}
            className="rounded-full bg-[var(--color-surface-2)] px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface-3)]"
          >
            Nouvelle identité
          </button>
          <button
            onClick={() => {
              if (confirm("Effacer toute trace de cette identité sur cet appareil ?")) {
                forget();
                setMsg("Identité effacée");
                setTimeout(() => setMsg(null), 2500);
              }
            }}
            className="rounded-full border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/10"
          >
            Tout effacer
          </button>
        </div>
      </section>

      {msg && (
        <p className="text-center text-sm font-medium text-[var(--color-accent)]">
          {msg}
        </p>
      )}
    </div>
  );
}
