export default function Loading() {
  return (
    <div className="px-3 py-8 sm:px-5">
      <div className="mb-4 h-7 w-36 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
      <div className="mb-6 flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-[var(--color-surface-2)]" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/5] animate-pulse rounded-xl bg-[var(--color-surface-2)]"
          />
        ))}
      </div>
    </div>
  );
}
