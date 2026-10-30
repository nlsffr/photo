export default function Loading() {
  return (
    <div className="px-3 py-8 sm:px-5">
      <div className="mx-auto h-11 max-w-lg animate-pulse rounded-full bg-[var(--color-surface-2)]" />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-[var(--color-surface-2)]" />
        ))}
      </div>
    </div>
  );
}
