export default function Loading() {
  return (
    <div className="flex h-[70dvh] items-center justify-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-surface-3)] border-t-[var(--color-accent)]" />
    </div>
  );
}
