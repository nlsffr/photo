import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getRankings } from "@/lib/photos";
import { formatCount } from "@/lib/format";
import { VerifiedBadge } from "@/components/VerifiedBadge";

export const metadata: Metadata = { title: "Classements" };

export default function RankingsPage() {
  const ranked = getRankings(20);
  const top = ranked[0];
  const maxScore = top ? top.totalViews + top.totalLikes * 3 : 1;

  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-5">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">🏆 Classements</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Les photographes les plus vus et appréciés.
        </p>
      </div>

      {/* Decorative period tabs */}
      <div className="mb-5 inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-sm font-semibold">
        <span className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-white">
          Cette semaine
        </span>
        <span className="rounded-full px-4 py-1.5 text-[var(--color-ink-faint)]">
          Ce mois
        </span>
        <span className="rounded-full px-4 py-1.5 text-[var(--color-ink-faint)]">
          Tout le temps
        </span>
      </div>

      <ol className="flex flex-col gap-2">
        {ranked.map((c, i) => {
          const score = c.totalViews + c.totalLikes * 3;
          const pct = Math.round((score / maxScore) * 100);
          return (
            <Link
              key={c.handle}
              href={`/creator/${c.handle}`}
              className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-colors hover:border-[var(--color-accent)]/50"
            >
              <span
                className={`w-8 shrink-0 text-center text-lg font-black ${
                  i === 0
                    ? "text-[var(--color-accent)]"
                    : i < 3
                      ? "text-[var(--color-ink)]"
                      : "text-[var(--color-ink-faint)]"
                }`}
              >
                {i + 1}
              </span>
              <Image
                src={c.avatarUrl}
                alt={c.name}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold">
                  <span className="truncate">{c.name}</span>
                  {c.verified && <VerifiedBadge size={13} />}
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-orange-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold">{formatCount(c.totalViews)}</p>
                <p className="text-xs text-[var(--color-ink-faint)]">vues</p>
              </div>
            </Link>
          );
        })}
      </ol>
    </div>
  );
}
