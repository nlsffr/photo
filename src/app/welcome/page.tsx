import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bienvenue",
  description: "Découvre LeakFanHub — photos et vidéos",
};

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-4xl font-black tracking-tight">
        Leak<span className="text-[var(--color-accent)]">FanHub</span>
      </h1>
      <p className="mt-4 text-lg text-[var(--color-ink-muted)]">
        Plateforme de découverte photo & vidéo. Feed masonry, mode vertical type
        TikTok, créateurs, tags, recherche.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link
          href="/"
          className="rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-bold text-white"
        >
          Entrer dans la galerie
        </Link>
        <Link
          href="/feed"
          className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
        >
          Feed vertical
        </Link>
        <Link
          href="/premium"
          className="rounded-full border border-amber-500/50 px-6 py-3 text-sm font-semibold text-amber-400"
        >
          Premium
        </Link>
      </div>
      <p className="mt-10 text-xs text-[var(--color-ink-faint)]">
        18+ uniquement. En continuant tu confirmes être majeur.
      </p>
    </div>
  );
}
