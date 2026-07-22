import Link from "next/link";

export function TagChips({
  tags,
  activeTag,
}: {
  tags: string[];
  activeTag?: string;
}) {
  const chip =
    "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition-colors";
  const on = "border-transparent bg-[var(--color-accent)] text-white";
  const off =
    "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]";

  return (
    <div className="no-scrollbar -mx-3 mb-4 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <Link href="/" className={`${chip} ${!activeTag ? on : off}`}>
        Tout
      </Link>
      {tags.map((tag) => (
        <Link
          key={tag}
          href={`/?tag=${encodeURIComponent(tag)}`}
          className={`${chip} ${tag === activeTag ? on : off}`}
        >
          {tag}
        </Link>
      ))}
    </div>
  );
}
