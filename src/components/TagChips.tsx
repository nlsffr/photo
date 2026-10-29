import Link from "next/link";

export function TagChips({
  tags,
  activeTag,
  hrefForTag,
  label = "Filtres par intérêt",
}: {
  tags: string[];
  activeTag?: string;
  hrefForTag?: (tag?: string) => string;
  label?: string;
}) {
  const chip =
    "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium capitalize transition-colors";
  const on = "border-transparent bg-[var(--color-accent)] text-white";
  const off =
    "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]";

  return (
    <nav
      className="no-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2 sm:mx-0 sm:px-0"
      aria-label={label}
    >
      <Link
        href={hrefForTag ? hrefForTag(undefined) : "/"}
        scroll={false}
        prefetch={false}
        className={`${chip} ${!activeTag ? on : off}`}
      >
        Tout
      </Link>
      {tags.map((tag) => (
        <Link
          key={tag}
          href={hrefForTag ? hrefForTag(tag) : `/?tag=${encodeURIComponent(tag)}`}
          scroll={false}
          prefetch={false}
          className={`${chip} ${tag === activeTag ? on : off}`}
        >
          {tag}
        </Link>
      ))}
    </nav>
  );
}
