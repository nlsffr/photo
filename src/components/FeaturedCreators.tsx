import Link from "next/link";
import { getModels } from "@/lib/photos";
import { MediaImg } from "./MediaImg";

export async function FeaturedCreators() {
  // Plus vus (pas followers) = vraie "vedette"
  const models = await getModels("views");
  const creators = models.slice(0, 16);

  if (creators.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-[var(--color-ink-faint)]">
        Modèles en vedette
      </h2>
      <div className="no-scrollbar -mx-3 flex gap-3.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:gap-4 sm:px-0">
        {creators.map((c) => {
          const src = c.avatarUrl || c.coverUrl;
          return (
            <Link
              key={c.handle}
              href={`/creator/${c.handle}`}
              className="flex w-[4.25rem] shrink-0 flex-col items-center gap-1.5"
            >
              <span className="rounded-full bg-gradient-to-tr from-[var(--color-accent)] to-orange-500 p-[2px]">
                <span className="block rounded-full bg-[var(--color-bg)] p-[2px]">
                  {src ? (
                    <MediaImg
                      src={src}
                      alt={c.name}
                      width={58}
                      height={58}
                      className="h-[58px] w-[58px] rounded-full object-cover object-top"
                    />
                  ) : (
                    <span className="grid h-[58px] w-[58px] place-items-center rounded-full bg-[var(--color-surface-2)] text-sm font-bold text-[var(--color-ink-faint)]">
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
