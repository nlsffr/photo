import type { Metadata } from "next";
import { SavedGallery } from "@/components/SavedGallery";

export const metadata: Metadata = { title: "Enregistrés" };

export default function FavorisPage() {
  return (
    <div className="px-3 py-5 sm:px-5">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Enregistrés</h1>
      <SavedGallery kind="saved" />
    </div>
  );
}
