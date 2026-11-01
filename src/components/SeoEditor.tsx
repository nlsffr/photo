"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  SEO_PAGES, SEO_LANGUAGES, SEO_TITLE_LIMIT, SEO_DESCRIPTION_LIMIT,
  type SeoEditorEntry, type SeoPageKey, type SeoLocale,
} from "@/lib/seo-editor-contract";
import { loadSeoEditorEntries, saveSeoEditorEntry, SeoEditorRequestError } from "@/lib/seo-editor-client";

type Draft = Pick<SeoEditorEntry, "title" | "description">;
type Issue = { message: string; kind?: string; key?: string; field?: keyof Draft };
type Undo = { draft: Draft; revision: number };
const draftOf = (entry: SeoEditorEntry): Draft => ({ title: entry.title, description: entry.description });
const entryKey = (entry: Pick<SeoEditorEntry, "page" | "locale">) => `${entry.page}:${entry.locale}`;
const stamp = (value: string | null) => value
  ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value))
  : "date non disponible";
const fieldClass = "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-3 text-base text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-60";
const buttonClass = "min-h-12 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-45";

export function SeoEditor() {
  const id = useId();
  const [entries, setEntries] = useState<SeoEditorEntry[]>([]);
  const [page, setPage] = useState<SeoPageKey>("home");
  const [locale, setLocale] = useState<SeoLocale>("fr");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [previous, setPrevious] = useState<Record<string, Undo>>({});
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({});
  const [publicationPending, setPublicationPending] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const key = `${page}:${locale}`;
  const entry = entries.find((value) => entryKey(value) === key);
  const draft = drafts[key] ?? (entry ? draftOf(entry) : { title: "", description: "" });
  const dirty = !!entry && (draft.title !== entry.title || draft.description !== entry.description);
  const conflict = !!conflicts[key];
  const currentIssue = issue && (!issue.key || issue.key === key) ? issue : null;
  const undo = previous[key];
  const canUndo = !!entry && !!undo && undo.revision === entry.revision && !dirty && !conflict;
  const disabled = loading || saving;
  const selectedPage = SEO_PAGES.find((value) => value.key === page)!;
  const previewPath = `/${locale}${selectedPage.path === "/" ? "" : selectedPage.path}`;

  async function load(signal?: AbortSignal, refresh = false) {
    setLoading(true);
    setIssue(null);
    try {
      const result = await loadSeoEditorEntries(signal);
      if (signal?.aborted) return;
      setEntries(result);
      setConflicts({});
      if (refresh) setNotice("Version actuelle chargée. Vos brouillons sont conservés ; vérifiez-les avant d’enregistrer.");
    } catch (error) {
      if (signal?.aborted) return;
      setIssue({ message: error instanceof Error ? error.message : "Chargement indisponible.", kind: error instanceof SeoEditorRequestError ? error.kind : undefined });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => { if (currentIssue || conflict) errorRef.current?.focus(); }, [currentIssue, conflict]);

  function change(field: keyof Draft, value: string) {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? draft), [field]: value } }));
    setNotice("");
    if (!conflict) setIssue(null);
  }

  async function persist(revert = false) {
    if (!entry || busy.current || conflict || (revert ? !canUndo : !dirty)) return;
    const value = revert ? undo.draft : draft;
    if (!value.title.trim() || value.title.length > SEO_TITLE_LIMIT) {
      setIssue({ key, field: "title", message: `Le titre est obligatoire et limité à ${SEO_TITLE_LIMIT} caractères.` });
      titleRef.current?.focus();
      return;
    }
    if (!value.description.trim() || value.description.length > SEO_DESCRIPTION_LIMIT) {
      setIssue({ key, field: "description", message: `La description est obligatoire et limitée à ${SEO_DESCRIPTION_LIMIT} caractères.` });
      descriptionRef.current?.focus();
      return;
    }
    busy.current = true;
    setSaving(true);
    setIssue(null);
    setNotice("");
    try {
      const saved = await saveSeoEditorEntry({ page, locale, ...value, revision: entry.revision });
      setPublicationPending((current) => ({ ...current, [key]: saved.publicationPending === true }));
      setEntries((current) => current.map((item) => entryKey(item) === key ? saved : item));
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
      setPrevious((current) => {
        const next = { ...current };
        if (revert) delete next[key];
        else next[key] = { draft: draftOf(entry), revision: saved.revision };
        return next;
      });
      setNotice(saved.publicationPending
        ? "Enregistré sur le serveur. L’actualisation de la page peut prendre quelques instants."
        : `${revert ? "Dernier enregistrement annulé" : "Enregistré sur le site"} le ${stamp(saved.updatedAt)}.`);
    } catch (error) {
      const kind = error instanceof SeoEditorRequestError ? error.kind : undefined;
      if (kind === "conflict") setConflicts((current) => ({ ...current, [key]: true }));
      setIssue({ key, kind, message: error instanceof Error ? error.message : "Enregistrement indisponible. Votre brouillon est conservé." });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-7">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">Éditeur privé</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Titres et descriptions</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-muted)]">Modifiez les textes publiés sur le site, page par page et langue par langue.</p>
      </header>

      {(currentIssue || conflict) && (
        <div id={`${id}-error`} ref={errorRef} role="alert" tabIndex={-1} className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">
          <p>{currentIssue?.message ?? "Une autre version a été enregistrée. Votre brouillon est conservé."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} disabled={disabled} onClick={() => load(undefined, true)}>{conflict ? "Charger la version actuelle" : "Réessayer le chargement"}</button>
            {currentIssue?.kind === "auth" && <Link className={buttonClass} href="/fr/connexion?next=%2Fadmin%2Fseo" prefetch={false}>Se reconnecter</Link>}
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="mb-4 min-h-5 text-sm text-[var(--color-ink-muted)]">{loading ? "Chargement des textes du site…" : saving ? "Enregistrement en cours…" : notice}</p>

      {entry && (
        <>
          <div className="mb-6 space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
            <div>
              <label htmlFor={`${id}-page`} className="mb-2 block text-sm font-semibold">Page</label>
              <select id={`${id}-page`} name="page" value={page} disabled={disabled} onChange={(event) => { setPage(event.target.value as SeoPageKey); setNotice(""); }} className={fieldClass}>
                {SEO_PAGES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Langue du texte</legend>
              <div className="flex flex-wrap gap-2">
                {SEO_LANGUAGES.map((language) => <button key={language.code} type="button" lang={language.code} aria-pressed={locale === language.code} disabled={disabled} onClick={() => { setLocale(language.code); setNotice(""); }} className={`${buttonClass} ${locale === language.code ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "bg-[var(--color-bg)] text-[var(--color-ink-muted)]"}`}>{language.label}</button>)}
              </div>
            </fieldset>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <form method="post" action="/api/admin/seo" onSubmit={(event) => { event.preventDefault(); return persist(); }} className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5" aria-busy={saving}>
              <div>
                <label htmlFor={`${id}-title`} className="mb-2 block text-sm font-semibold">Titre <span className="text-[var(--color-ink-faint)]">(obligatoire)</span></label>
                <input ref={titleRef} id={`${id}-title`} name="title" type="text" value={draft.title} onChange={(event) => change("title", event.target.value)} maxLength={SEO_TITLE_LIMIT} required disabled={disabled} aria-invalid={currentIssue?.field === "title" || undefined} aria-describedby={`${id}-title-count${currentIssue?.field === "title" ? ` ${id}-error` : ""}`} className={fieldClass} />
                <p id={`${id}-title-count`} className="mt-1.5 text-xs text-[var(--color-ink-muted)]">{draft.title.length} / {SEO_TITLE_LIMIT} caractères</p>
              </div>
              <div>
                <label htmlFor={`${id}-description`} className="mb-2 block text-sm font-semibold">Description <span className="text-[var(--color-ink-faint)]">(obligatoire)</span></label>
                <textarea ref={descriptionRef} id={`${id}-description`} name="description" rows={7} value={draft.description} onChange={(event) => change("description", event.target.value)} maxLength={SEO_DESCRIPTION_LIMIT} required disabled={disabled} aria-invalid={currentIssue?.field === "description" || undefined} aria-describedby={`${id}-description-count${currentIssue?.field === "description" ? ` ${id}-error` : ""}`} className={`${fieldClass} resize-y`} />
                <p id={`${id}-description-count`} className="mt-1.5 text-xs text-[var(--color-ink-muted)]">{draft.description.length} / {SEO_DESCRIPTION_LIMIT} caractères</p>
              </div>
              <p className="text-xs leading-5 text-[var(--color-ink-faint)]">Le texte est conservé tel que vous le saisissez, sans suffixe ajouté ni réécriture automatique.</p>
              <button type="submit" disabled={disabled || !dirty || conflict} className={`${buttonClass} w-full border-transparent bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-600)]`}>Enregistrer sur le site</button>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={disabled || !dirty} onClick={() => { setDrafts((current) => { const next = { ...current }; delete next[key]; return next; }); setNotice("Brouillon abandonné ; les textes publiés n’ont pas changé."); }} className={buttonClass}>Abandonner le brouillon</button>
                <button type="button" disabled={disabled || !canUndo} onClick={() => persist(true)} className={buttonClass}>Annuler le dernier enregistrement</button>
              </div>
            </form>

            <aside className="space-y-4 lg:sticky lg:top-20">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
                <h2 className="text-sm font-semibold">Aperçu du site</h2>
                <p className="mt-1 text-xs leading-5 text-[var(--color-ink-muted)]">Cet aperçu ne prédit pas le résultat affiché par Google.</p>
                <div lang={locale} className="mt-5 break-words rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                  <p className="text-xs text-[var(--color-ink-faint)]">LeakFanHub · {previewPath}</p>
                  <p className="mt-2 whitespace-pre-wrap text-xl font-semibold leading-snug text-[var(--color-ink)]">{draft.title || "Votre titre"}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-ink-muted)]">{draft.description || "Votre description"}</p>
                </div>
                <p className="mt-4 text-xs text-[var(--color-ink-muted)]">{dirty ? "Brouillon — modifications non enregistrées" : entry.source === "saved" ? `${publicationPending[key] ? "Enregistré" : "Publié"} le ${stamp(entry.updatedAt)}` : "Textes actuels du site"}</p>
                <Link href={previewPath} prefetch={false} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-12 items-center text-sm font-semibold text-[var(--color-accent)] underline underline-offset-4">Ouvrir la page publiée ↗</Link>
              </div>
              {dirty && <details className="rounded-xl border border-[var(--color-border)] p-4 text-sm"><summary className="cursor-pointer font-semibold">Comparer avec la version publiée</summary><div lang={locale} className="mt-3 space-y-2 break-words text-[var(--color-ink-muted)]"><p>{entry.title}</p><p>{entry.description}</p></div></details>}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
