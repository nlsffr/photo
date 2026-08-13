export default function Loading() {
  return (
    <div className="px-3 py-8 sm:px-5">
      <div className="mb-6 h-8 w-40 animate-pulse rounded-lg bg-[var(--color-surface-2)]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
