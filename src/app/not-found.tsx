import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 px-6 py-32 text-center">
      <p className="bg-gradient-to-br from-[var(--color-accent)] to-orange-500 bg-clip-text text-6xl font-black text-transparent">
        404
      </p>
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="text-[var(--color-ink-muted)]">
        Cette photo ou ce profil n’existe pas (ou plus).
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
      >
        Retour à la galerie
      </Link>
    </div>
  );
}
