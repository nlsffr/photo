import Link from "next/link";
import { getModels } from "@/lib/photos";
import { MediaImg } from "./MediaImg";

export async function FeaturedCreators() {
  const models = await getModels("views");
  // Plus de modèles importants visibles
  const creators = models.slice(0, 28);

  if (creators.length === 0) return null;

  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink-faint)]">
          Modèles en vedette
        </h2>
        <Link
          href="/models"
          className="text-xs font-semibold text-[var(--color-accent)]"
        >
          Voir tout
        </Link>
      </div>
      <div className="no-scrollbar -mx-2 flex gap-3 overflow-x-auto px-2 pb-1 sm:mx-0 sm:gap-3.5 sm:px-0">
        {creators.map((c) => {
          const src = c.avatarUrl || c.coverUrl;
          return (
            <Link
              key={c.handle}
              href={`/creator/${c.handle}`}
              className="flex w-[4.1rem] shrink-0 flex-col items-center gap-1.5 sm:w-[4.5rem]"
            >
              <span className="rounded-full bg-gradient-to-tr from-[var(--color-accent)] to-orange-400 p-[2px]">
                <span className="block rounded-full bg-[var(--color-bg)] p-[2px]">
                  {src ? (
                    <MediaImg
                      src={src}
                      alt={c.name}
                      width={58}
                      height={58}
                      className="h-[52px] w-[52px] rounded-full object-cover object-top sm:h-[58px] sm:w-[58px]"
                    />
                  ) : (
                    <span className="grid h-[52px] w-[52px] place-items-center rounded-full bg-[var(--color-surface-2)] text-sm font-bold text-[var(--color-ink-faint)] sm:h-[58px] sm:w-[58px]">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
              </span>
              <span className="w-full truncate text-center text-[11px] leading-tight text-[var(--color-ink-muted)]">
                {c.name.split(" ")[0]}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
