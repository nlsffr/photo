import type { ReactNode } from "react";

/** Shared shell for legal / policy pages: title, last-updated, prose sections. */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro?: string;
  sections: { heading: string; body: ReactNode }[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-faint)]">
        Dernière mise à jour : {updated}
      </p>
      {intro && (
        <p className="mt-4 text-lg text-[var(--color-ink-muted)]">{intro}</p>
      )}

      <div className="mt-8 flex flex-col gap-7">
        {sections.map((s, i) => (
          <section key={s.heading}>
            <h2 className="text-lg font-bold tracking-tight">
              <span className="mr-2 tabular-nums text-[var(--color-accent)]">
                {i + 1}.
              </span>
              {s.heading}
            </h2>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
