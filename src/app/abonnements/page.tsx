import type { Metadata } from "next";
import { getAllPhotoViews } from "@/lib/photos";
import { FollowingFeed } from "@/components/FollowingFeed";

export const metadata: Metadata = { title: "Abonnements" };

export default function AbonnementsPage() {
  const items = getAllPhotoViews();
  return (
    <div className="px-3 py-5 sm:px-5">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Abonnements</h1>
      <p className="mb-4 text-sm text-[var(--color-ink-faint)]">
        Les dernières publications des photographes que tu suis.
      </p>
      <FollowingFeed items={items} />
    </div>
  );
}
