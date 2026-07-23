import type { Metadata } from "next";
import { getAllPhotoViews } from "@/lib/photos";
import { ForYouGallery } from "@/components/ForYouGallery";

export const metadata: Metadata = { title: "Pour toi" };

export default async function PourToiPage() {
  const items = await getAllPhotoViews();
  return (
    <div className="px-3 py-5 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Pour toi</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-faint)]">
        Un feed personnalisé qui s’adapte à ce que tu aimes.
      </p>
      <ForYouGallery items={items} />
    </div>
  );
}
