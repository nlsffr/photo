import Link from "next/link";
import type { CreatorWithStats } from "@/lib/types";
import { creatorHref } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { VerifiedBadge } from "./VerifiedBadge";
import { MediaImg } from "./MediaImg";

export function CreatorCard({ creator }: { creator: CreatorWithStats }) {
  const img = creator.avatarUrl || creator.coverUrl;

  return (
    <Link
      href={creatorHref(creator.handle)}
      className="group block overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] transition hover:ring-[var(--color-accent)]/60"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-[var(--color-surface-2)]">
        {img ? (
          <MediaImg
            src={img}
            alt={creator.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-surface)] text-3xl font-bold text-[var(--color-ink-faint)]">
            {creator.name.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="flex items-center gap-1 font-semibold text-white drop-shadow">
            <span className="truncate">{creator.name}</span>
            {creator.verified && <VerifiedBadge size={13} />}
          </p>
          <p className="mt-0.5 text-[11px] text-white/80">
            {creator.photoCount} médias · {formatCount(creator.followers)} abonnés
          </p>
        </div>
      </div>
    </Link>
  );
}
