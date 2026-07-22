import Image from "next/image";
import Link from "next/link";
import { getModels } from "@/lib/photos";

export function FeaturedCreators() {
  const creators = getModels("followers").slice(0, 16);

  return (
    <section className="mb-5">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
        Modèles en vedette
      </h2>
      <div className="no-scrollbar -mx-3 flex gap-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {creators.map((c) => (
          <Link
            key={c.handle}
            href={`/creator/${c.handle}`}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5"
          >
            <span className="rounded-full bg-gradient-to-tr from-[var(--color-accent)] to-orange-500 p-[2px]">
              <span className="block rounded-full p-[2px] ring-0">
                <Image
                  src={c.avatarUrl}
                  alt={c.name}
                  width={58}
                  height={58}
                  className="h-[58px] w-[58px] rounded-full object-cover ring-2 ring-[var(--color-bg)]"
                />
              </span>
            </span>
            <span className="w-full truncate text-center text-xs text-[var(--color-ink-muted)]">
              {c.name.split(" ")[0]}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
