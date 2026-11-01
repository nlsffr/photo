import {
  SEO_LANGUAGES, SEO_PAGES, SEO_TITLE_LIMIT, SEO_DESCRIPTION_LIMIT,
  type SeoEditorEntry, type SeoEditorSave,
} from "./seo-editor-contract";

type ErrorKind = "auth" | "forbidden" | "conflict" | "unavailable" | "invalid" | "network";
const MESSAGES: Record<ErrorKind, string> = {
  auth: "Votre session a expiré. Reconnectez-vous ; votre brouillon est conservé ici.",
  forbidden: "Ce compte n’a pas accès à cet éditeur.",
  conflict: "Une autre version a été enregistrée. Votre brouillon est conservé ; chargez la version actuelle avant de continuer.",
  unavailable: "Enregistrement indisponible. Votre brouillon est conservé ; réessayez dans un instant.",
  invalid: "La réponse du site est incomplète. Votre brouillon est conservé.",
  network: "Connexion interrompue. Votre brouillon est conservé ; réessayez.",
};

export class SeoEditorRequestError extends Error {
  readonly kind: ErrorKind;
  constructor(kind: ErrorKind) {
    super(MESSAGES[kind]);
    this.kind = kind;
  }
}

export function isSeoEditorEntry(value: unknown): value is SeoEditorEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as SeoEditorEntry;
  return SEO_PAGES.some((page) => page.key === entry.page)
    && SEO_LANGUAGES.some((language) => language.code === entry.locale)
    && typeof entry.title === "string" && entry.title.length <= SEO_TITLE_LIMIT
    && typeof entry.description === "string" && entry.description.length <= SEO_DESCRIPTION_LIMIT
    && Number.isSafeInteger(entry.revision) && entry.revision >= 0
    && (entry.source === "default" || entry.source === "saved")
    && (entry.updatedAt === null || (typeof entry.updatedAt === "string" && Number.isFinite(Date.parse(entry.updatedAt))));
}

async function request(init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch("/api/admin/seo", { cache: "no-store", credentials: "same-origin", ...init });
  } catch {
    throw new SeoEditorRequestError("network");
  }
  if (!response.ok) {
    const kind = response.status === 401 ? "auth" : response.status === 403 ? "forbidden" : response.status === 409 ? "conflict" : "unavailable";
    throw new SeoEditorRequestError(kind);
  }
  try {
    return await response.json();
  } catch {
    throw new SeoEditorRequestError("invalid");
  }
}

export async function loadSeoEditorEntries(signal?: AbortSignal): Promise<SeoEditorEntry[]> {
  const payload = await request({ method: "GET", signal }) as { entries?: unknown };
  if (!Array.isArray(payload?.entries) || payload.entries.length !== SEO_PAGES.length * SEO_LANGUAGES.length
    || !payload.entries.every(isSeoEditorEntry)
    || new Set(payload.entries.map((entry) => `${entry.page}:${entry.locale}`)).size !== payload.entries.length) {
    throw new SeoEditorRequestError("invalid");
  }
  return payload.entries;
}

export type SeoEditorSavedEntry = SeoEditorEntry & { publicationPending?: boolean };

export async function saveSeoEditorEntry(value: SeoEditorSave): Promise<SeoEditorSavedEntry> {
  const payload = await request({
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
  }) as { entry?: unknown; publicationPending?: unknown };
  if (!isSeoEditorEntry(payload?.entry) || payload.entry.page !== value.page
    || payload.entry.locale !== value.locale || payload.entry.revision <= value.revision) {
    throw new SeoEditorRequestError("invalid");
  }
  return { ...payload.entry, ...(payload.publicationPending === true ? { publicationPending: true } : {}) };
}
