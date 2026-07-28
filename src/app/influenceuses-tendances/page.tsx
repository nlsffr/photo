import type { Metadata } from "next";
import Link from "next/link";
import { getModels } from "@/lib/photos";
import { CreatorCard } from "@/components/CreatorCard";

export const metadata: Metadata = { title: "Influenceuses tendances" };

export default async function InfluenceusesTendancesPage() {
  // "Trending" = models whose content is getting the most views right now.
  const models = await getModels("views");
  const trending = models.filter((m) => m.totalViews > 0);

  return (
    <div className="px-3 py-6 sm:px-5">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          Influenceuses tendances 🔥
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Les modèles dont le contenu grimpe le plus en ce moment, classés par
          vues.
        </p>
      </div>

      {trending.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="text-lg font-semibold">Pas encore de tendances</p>
          <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
            Dès que des modèles publieront et seront vus, ils apparaîtront ici,
            classés par popularité du moment.
          </p>
          <Link
            href="/models"
            className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-600)]"
          >
            Voir tous les modèles
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {trending.map((c, i) => (
            <div key={c.handle} className="relative">
              {i < 3 && (
                <span className="absolute left-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-[var(--color-accent)] text-xs font-black text-white shadow-lg">
                  {i + 1}
                </span>
              )}
              <CreatorCard creator={c} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
