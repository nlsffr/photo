import type { Metadata } from "next";
import { getPhotos } from "@/lib/photos";
import { ForYouGallery } from "@/components/ForYouGallery";

export const metadata: Metadata = { title: "Pour toi" };
export const dynamic = "force-dynamic";

export default async function PourToiPage() {
  // Always seed with a solid popular set so the page is never empty shell
  const page = await getPhotos({ sort: "popular", limit: 80 });
  const extra = await getPhotos({ sort: "trending", limit: 40 });
  const seen = new Set<string>();
  const items = [...page.items, ...extra.items].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  return (
    <div className="px-3 py-5 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Pour toi</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-faint)]">
        Personnalisé selon tes likes, enregistrements et abonnements.
      </p>
      <ForYouGallery items={items} limit={80} />
    </div>
  );
}
