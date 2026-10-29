"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import type { MediaType, SortKey } from "@/lib/types";
import { buildHomeHref } from "@/lib/home-filter-links";
import { TagChips } from "./TagChips";
import { useLocale } from "./LocaleProvider";
import { localePath } from "@/lib/i18n/config";

type Props = {
  tags: string[];
  sort: SortKey;
  type?: MediaType;
  tag?: string;
};

const chip =
  "tap-lg shrink-0 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors";
const activeChip =
  "border-transparent bg-[var(--color-accent)] text-white shadow-sm shadow-[var(--color-accent)]/25";
const idleChip =
  "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]";

export function HomeFilters({ tags, sort, type, tag }: Props) {
  const { locale, t } = useLocale();
  const homePath = localePath(locale, "/");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const state = { sort, type, tag };
  const priorityTags = tags.slice(0, 10);
  const activeCount = Number(sort !== "discover") + Number(Boolean(type)) + Number(Boolean(tag));
  const filteredTags = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? tags.filter((item) => item.toLocaleLowerCase().includes(query))
      : tags;
  }, [search, tags]);

  const showDialog = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    searchRef.current?.focus();
    setOpen(true);
  };

  const closeDialog = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  };

  const quickFilters = [
    {
      label: t("home.filters.discover"),
      active: sort === "discover",
      href: buildHomeHref(state, { sort: "discover" }, homePath),
    },
    {
      label: t("home.filters.trending"),
      active: sort === "trending",
      href: buildHomeHref(state, { sort: "trending" }, homePath),
    },
    {
      label: t("home.filters.recent"),
      active: sort === "recent",
      href: buildHomeHref(state, { sort: "recent" }, homePath),
    },
    {
      label: t("home.filters.photos"),
      active: type === "photo",
      href: buildHomeHref(state, { type: type === "photo" ? null : "photo" }, homePath),
    },
    {
      label: t("home.filters.videos"),
      active: type === "video",
      href: buildHomeHref(state, { type: type === "video" ? null : "video" }, homePath),
    },
  ];

  return (
    <section className="mb-4 space-y-2.5" aria-label={t("home.filters.label")}>
      <div className="no-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2 sm:mx-0 sm:px-0">
        {quickFilters.map((filter) => (
          <Link
            key={filter.label}
            href={filter.href}
            scroll={false}
            prefetch={false}
            aria-current={filter.active ? "page" : undefined}
            className={`${chip} ${filter.active ? activeChip : idleChip}`}
          >
            {filter.label}
          </Link>
        ))}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={dialogId}
          onClick={showDialog}
          className={`${chip} ${tag ? activeChip : idleChip}`}
        >
          {t("home.filters.all")}{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
        <Link
          href={localePath(locale, "/feed")}
          prefetch={false}
          className={`${chip} ml-auto ${idleChip}`}
        >
          Feed ↗
        </Link>
      </div>

      {priorityTags.length > 0 ? (
        <TagChips
          tags={priorityTags}
          activeTag={tag}
          hrefForTag={(nextTag) => buildHomeHref(state, { tag: nextTag ?? null }, homePath)}
          label={t("home.filters.popularInterests")}
        />
      ) : null}

      {activeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-muted)]">
          <span>
            {t("home.filters.active")} : {[
              sort !== "discover" ? sort : null,
              type,
              tag,
            ].filter(Boolean).join(" · ")}
          </span>
          <Link
            href={buildHomeHref(state, { clearAll: true }, homePath)}
            scroll={false}
            prefetch={false}
            className="font-semibold text-[var(--color-accent)] hover:underline"
          >
            {t("home.filters.clear")}
          </Link>
        </div>
      ) : null}

      <dialog
        ref={dialogRef}
        id={dialogId}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        className="home-filter-dialog m-auto max-h-[min(82svh,46rem)] w-[calc(100%_-_1rem)] max-w-2xl rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-ink)] shadow-2xl"
      >
        <div className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-lg font-bold">{t("home.filters.title")}</h2>
              <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                {t("home.filters.description")}
              </p>
            </div>
            <form method="dialog">
              <button
                type="submit"
                aria-label={t("home.filters.close")}
                className="tap-lg rounded-full border border-[var(--color-border)] px-3 text-lg text-[var(--color-ink-muted)]"
              >
                ×
              </button>
            </form>
          </div>
          <label className="mt-4 block">
            <span className="sr-only">{t("home.filters.search")}</span>
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("home.filters.searchPlaceholder")}
              autoFocus
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-sm outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 sm:p-5">
          {filteredTags.map((item) => {
            const active = item === tag;
            return (
              <Link
                key={item}
                href={buildHomeHref(state, { tag: active ? null : item }, homePath)}
                scroll={false}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                onClick={closeDialog}
                className={`rounded-2xl border px-3 py-3 text-sm font-medium capitalize transition-colors ${
                  active ? activeChip : idleChip
                }`}
              >
                {item}
              </Link>
            );
          })}
          {filteredTags.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-[var(--color-ink-muted)]">
              {t("home.filters.empty")}
            </p>
          ) : null}
        </div>
      </dialog>
    </section>
  );
}
