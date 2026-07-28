import Link from "next/link";
import type { CreatorWithStats } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { VerifiedBadge } from "./VerifiedBadge";
import { MediaImg } from "./MediaImg";

export function CreatorCard({ creator }: { creator: CreatorWithStats }) {
  const cover = creator.coverUrl || creator.avatarUrl;
  const avatar = creator.avatarUrl || creator.coverUrl;

  return (
    <Link
      href={`/creator/${creator.handle}`}
      className="group block overflow-hidden rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] transition hover:ring-[var(--color-accent)]/50"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--color-surface-2)]">
        {cover ? (
          <MediaImg
            src={cover}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface)] via-transparent" />
      </div>
      <div className="relative -mt-7 px-3 pb-3">
        {avatar ? (
          <MediaImg
            src={avatar}
            alt={creator.name}
            width={52}
            height={52}
            className="h-[52px] w-[52px] rounded-full object-cover ring-4 ring-[var(--color-surface)]"
          />
        ) : (
          <div className="h-[52px] w-[52px] rounded-full bg-[var(--color-surface-2)] ring-4 ring-[var(--color-surface)]" />
        )}
        <p className="mt-1.5 flex items-center gap-1 font-semibold">
          <span className="truncate">{creator.name}</span>
          {creator.verified && <VerifiedBadge size={13} />}
        </p>
        <p className="text-xs text-[var(--color-ink-faint)]">
          {creator.photoCount} photos · {formatCount(creator.followers)} abonnés
        </p>
      </div>
    </Link>
  );
}
