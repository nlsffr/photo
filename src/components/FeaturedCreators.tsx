import Link from "next/link";
import { getModels } from "@/lib/photos";
import { MediaImg } from "./MediaImg";

export async function FeaturedCreators() {
  const models = await getModels("followers");
  const creators = models.slice(0, 16);

  if (creators.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[var(--color-ink-faint)]">
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
              <span className="block rounded-full p-[2px]">
                <MediaImg
                  src={c.avatarUrl || c.coverUrl}
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
