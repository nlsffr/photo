import Link from "next/link";
import type { CreatorWithStats } from "@/lib/types";
import { formatCount } from "@/lib/format";
import { VerifiedBadge } from "./VerifiedBadge";
import { MediaImg } from "./MediaImg";

export function CreatorCard({ creator }: { creator: CreatorWithStats }) {
  // Prefer a real media cover for the card background; fall back to avatar
  const cover = creator.coverUrl || creator.avatarUrl;
  const avatar = creator.avatarUrl || creator.coverUrl;

  return (
    <Link
      href={`/creator/${creator.handle}`}
      className="group block overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] transition hover:ring-[var(--color-accent)]/60"
    >
      {/* Portrait ratio — better for people than 16:10 landscape crop */}
      <div className="relative aspect-[3/4] overflow-hidden bg-[var(--color-surface-2)]">
        {cover ? (
          <MediaImg
            src={cover}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-surface)]" />
        )}

        {/* Soft bottom gradient for text legibility */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* Small avatar badge top-left */}
        {avatar ? (
          <div className="absolute left-2.5 top-2.5">
            <MediaImg
              src={avatar}
              alt={creator.name}
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover object-top ring-2 ring-white/80"
            />
          </div>
        ) : null}

        {/* Name + stats over the image */}
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
