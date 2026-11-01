import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getDbPool } from "./db-pool";
import { getSeoDefault } from "./seo-editor-defaults";
import {
  SEO_LANGUAGES, SEO_PAGES, SEO_DESCRIPTION_LIMIT, SEO_TITLE_LIMIT,
  type SeoEditorEntry, type SeoEditorSave, type SeoLocale, type SeoPageKey,
} from "./seo-editor-contract";

interface SeoRow extends RowDataPacket {
  page_key: SeoPageKey;
  locale: SeoLocale;
  title: string;
  description: string;
  revision: number;
  updated_at: Date | string;
}
const MAX_REVISION = 4_294_967_294;
const COLUMNS = "page_key, locale, title, description, revision, updated_at";

export function validateSeoSave(value: unknown): SeoEditorSave | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(",") !== "description,locale,page,revision,title") return null;
  if (!SEO_PAGES.some((page) => page.key === body.page) || !SEO_LANGUAGES.some((language) => language.code === body.locale)) return null;
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || Number(body.revision) > MAX_REVISION) return null;
  for (const [key, limit] of [["title", SEO_TITLE_LIMIT], ["description", SEO_DESCRIPTION_LIMIT]] as const) {
    const text = body[key];
    if (typeof text !== "string" || !text.trim() || text.length > limit || /[\u0000-\u001f\u007f]/.test(text)) return null;
  }
  return body as SeoEditorSave;
}

function entryFromRow(row: SeoRow): SeoEditorEntry {
  return { page: row.page_key, locale: row.locale, title: row.title, description: row.description,
    revision: Number(row.revision), updatedAt: new Date(row.updated_at).toISOString(), source: "saved" };
}
function missingTable(error: unknown): boolean {
  return (error as { code?: string; errno?: number } | null)?.code === "ER_NO_SUCH_TABLE"
    || (error as { errno?: number } | null)?.errno === 1146;
}

export async function readSeoOverride(locale: SeoLocale, page: SeoPageKey): Promise<SeoEditorEntry | null> {
  const db = getDbPool();
  if (!db) return null;
  try {
    const [rows] = await db.execute<SeoRow[]>(`SELECT ${COLUMNS} FROM seo_page_settings WHERE page_key = :page AND locale = :locale`, { page, locale });
    return rows[0] ? entryFromRow(rows[0]) : null;
  } catch (error) {
    // Keep the public site usable during deployment; saves still require 023.
    if (missingTable(error)) return null;
    throw error;
  }
}

export async function listSeoEntries(): Promise<SeoEditorEntry[]> {
  const db = getDbPool();
  let rows: SeoRow[] = [];
  if (db) {
    const result = await db.execute<SeoRow[]>(`SELECT ${COLUMNS} FROM seo_page_settings`);
    rows = result[0];
  }
  const overrides = new Map(rows.map((row) => [`${row.locale}:${row.page_key}`, entryFromRow(row)]));
  return SEO_LANGUAGES.flatMap(({ code }) => SEO_PAGES.map(({ key }) => overrides.get(`${code}:${key}`) ?? getSeoDefault(code, key)));
}

type SaveResult = { ok: true; entry: SeoEditorEntry } | { ok: false; error: "conflict" | "unavailable" };
export async function saveSeoEntry(input: SeoEditorSave, actor: string): Promise<SaveResult> {
  if (!validateSeoSave(input) || !actor) throw new Error("Invalid SEO edit");
  const db = getDbPool();
  if (!db) return { ok: false, error: "unavailable" };
  const connection = await db.getConnection();
  let transactionOpen = false;
  try {
    await connection.beginTransaction(); transactionOpen = true;
    const [rows] = await connection.execute<SeoRow[]>(`SELECT ${COLUMNS} FROM seo_page_settings WHERE page_key = :page AND locale = :locale FOR UPDATE`, input);
    const current = rows[0] ? entryFromRow(rows[0]) : getSeoDefault(input.locale, input.page);
    if (current.revision !== input.revision) {
      await connection.rollback(); transactionOpen = false;
      return { ok: false, error: "conflict" };
    }
    if (rows[0] && current.title === input.title && current.description === input.description) {
      await connection.commit(); transactionOpen = false;
      return { ok: true, entry: current };
    }
    const now = new Date(), nextRevision = current.revision + 1;
    const params = { ...input, actor, now };
    const [changed] = rows[0]
      ? await connection.execute<ResultSetHeader>(`UPDATE seo_page_settings SET title = :title, description = :description,
          revision = revision + 1, updated_at = :now, updated_by = :actor
          WHERE page_key = :page AND locale = :locale AND revision = :revision`, params)
      : await connection.execute<ResultSetHeader>(`INSERT INTO seo_page_settings
          (page_key, locale, title, description, revision, updated_at, updated_by)
          VALUES (:page, :locale, :title, :description, 1, :now, :actor)`, params);
    if (changed.affectedRows !== 1) {
      await connection.rollback(); transactionOpen = false;
      return { ok: false, error: "conflict" };
    }
    await connection.execute(`INSERT INTO seo_page_history
      (page_key, locale, previous_title, previous_description, next_title, next_description,
       previous_revision, next_revision, actor_user_id, changed_at)
      VALUES (:page, :locale, :previousTitle, :previousDescription, :nextTitle, :nextDescription,
        :previousRevision, :nextRevision, :actor, :now)`, {
      page: input.page, locale: input.locale, previousTitle: current.title, previousDescription: current.description,
      nextTitle: input.title, nextDescription: input.description, previousRevision: current.revision, nextRevision, actor, now,
    });
    await connection.commit(); transactionOpen = false;
    return { ok: true, entry: { ...input, revision: nextRevision, updatedAt: now.toISOString(), source: "saved" } };
  } catch (error) {
    if (transactionOpen) await connection.rollback();
    const code = (error as { code?: string; errno?: number } | null)?.code;
    if (code === "ER_DUP_ENTRY" || code === "ER_LOCK_DEADLOCK") return { ok: false, error: "conflict" };
    if (missingTable(error)) return { ok: false, error: "unavailable" };
    throw error;
  } finally { connection.release(); }
}
