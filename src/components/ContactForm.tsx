"use client";

import { useState } from "react";
import { useLocale } from "./LocaleProvider";

type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "url";
  placeholder?: string;
  required?: boolean;
};

type Status = "idle" | "sending" | "sent" | "error";

export function ContactForm({
  kind,
  fields,
  reasons,
  submitLabel,
}: {
  /** Which form this is — labels the email on the server. */
  kind: string;
  fields: Field[];
  reasons?: string[];
  submitLabel?: string;
}) {
  const { t } = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = { ...data, kind };

    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        form.reset();
        setStatus("sent");
      } else {
        const errorKey = json.error && [
          "invalid_email",
          "empty_message",
          "rate_limited",
          "not_configured",
          "send_failed",
          "bad_request",
        ].includes(json.error)
          ? json.error
          : "send_failed";
        setErrorMsg(t(`contactForm.errors.${errorKey}`));
        setStatus("error");
      }
    } catch {
      setErrorMsg(t("contactForm.errors.network"));
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="mt-3 text-lg font-bold">{t("contactForm.sentTitle")}</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {t("contactForm.sentBody")}
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-4 rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        >
          {t("contactForm.another")}
        </button>
      </div>
    );
  }

  const input =
    "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]";
  const sending = status === "sending";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            disabled={sending}
            className={input}
          />
        </label>
      ))}

      {reasons && reasons.length > 0 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">
            {t("contactForm.reason")}<span className="text-[var(--color-accent)]"> *</span>
          </span>
          <select name="reason" required disabled={sending} className={input}>
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
          {t("contactForm.message")}<span className="text-[var(--color-accent)]"> *</span>
        </span>
        <textarea
          name="message"
          required
          rows={6}
          disabled={sending}
          placeholder={t("contactForm.messagePlaceholder")}
          className={`${input} resize-y`}
        />
      </label>

      {status === "error" && errorMsg && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="mt-1 inline-flex items-center gap-2 self-start rounded-full bg-[var(--color-accent)] px-7 py-2.5 text-sm font-bold text-white hover:bg-[var(--color-accent-600)] disabled:opacity-60"
      >
        {sending && (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            aria-hidden
          />
        )}
        {sending ? t("contactForm.sending") : submitLabel ?? t("contactForm.submit")}
      </button>

      <p className="text-xs text-[var(--color-ink-faint)]">
        {t("contactForm.privacy")}
      </p>
    </form>
  );
}
