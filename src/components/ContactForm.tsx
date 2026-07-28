"use client";

import { useState } from "react";

type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "url";
  placeholder?: string;
  required?: boolean;
};

export function ContactForm({
  fields,
  reasons,
  submitLabel = "Envoyer",
}: {
  fields: Field[];
  reasons?: string[];
  submitLabel?: string;
}) {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="mt-3 text-lg font-bold">Message envoyé</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Merci — on revient vers toi dès que possible.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          Envoyer un autre message
        </button>
      </div>
    );
  }

  const input =
    "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="flex flex-col gap-4"
    >
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">
            {f.label}
            {f.required && <span className="text-[var(--color-accent)]"> *</span>}
          </span>
          <input
            name={f.name}
            type={f.type ?? "text"}
            required={f.required}
            placeholder={f.placeholder}
            className={input}
          />
        </label>
      ))}

      {reasons && reasons.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">
            Motif<span className="text-[var(--color-accent)]"> *</span>
          </span>
          <select name="reason" required className={input}>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">
          Message<span className="text-[var(--color-accent)]"> *</span>
        </span>
        <textarea
          name="message"
          required
          rows={6}
          placeholder="Décris ta demande en détail…"
          className={`${input} resize-y`}
        />
      </label>

      <button
        type="submit"
        className="mt-1 self-start rounded-full bg-[var(--color-accent)] px-7 py-2.5 text-sm font-bold text-white hover:bg-[var(--color-accent-600)]"
      >
        {submitLabel}
      </button>

      <p className="text-xs text-[var(--color-ink-faint)]">
        En envoyant ce formulaire, tu acceptes que ta demande soit traitée
        conformément à notre politique de confidentialité. Aucune donnée n’est
        partagée avec des tiers.
      </p>
    </form>
  );
}
