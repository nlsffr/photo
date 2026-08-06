import type { Metadata } from "next";
import Link from "next/link";
import { getPhotos } from "@/lib/photos";
import { InfiniteGallery } from "@/components/InfiniteGallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aléatoire",
  description: "Ordre purement aléatoire — différent à chaque rechargement",
};

export default async function RandomMediasPage() {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const page = await getPhotos({ sort: "random", seed, limit: 30 });
  return (
    <div className="px-3 py-4 sm:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Aléatoire</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Nouvel ordre à chaque clic sur Recharger.
          </p>
        </div>
        <Link
          href="/random/medias"
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white"
        >
          Recharger
        </Link>
      </div>
      <InfiniteGallery key={seed} initial={page} params={{ sort: "random" }} />
    </div>
  );
}
