import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./auth";
import { getSessionUser, type SessionUser } from "./auth-db";

export function isSeoEditorId(id: string): boolean {
  return Boolean(id) && (process.env.SEO_EDITOR_USER_IDS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean).includes(id);
}

export async function getSeoEditorSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSessionUser(token) : null;
}

export async function getSeoEditorUser(): Promise<SessionUser | null> {
  const user = await getSeoEditorSessionUser();
  return user && isSeoEditorId(user.id) ? user : null;
}

export function hasSeoWriteOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    if (!["http:", "https:"].includes(supplied.protocol) || supplied.origin !== origin) return false;
    const canonical = process.env.NEXT_PUBLIC_SITE_URL;
    if (canonical) return origin === new URL(canonical).origin;
    return process.env.NODE_ENV !== "production" && origin === new URL(request.url).origin;
  } catch { return false; }
}

export class SeoEditorRequestError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("Invalid editor request");
    this.status = status;
  }
}

export async function readSeoEditorJson(request: Request): Promise<unknown> {
  const limit = 16 * 1024;
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new SeoEditorRequestError(415);
  if (Number(request.headers.get("content-length")) > limit) throw new SeoEditorRequestError(413);
  if (!request.body) throw new SeoEditorRequestError(400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new SeoEditorRequestError(413); }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    if (error instanceof SeoEditorRequestError) throw error;
    throw new SeoEditorRequestError(400);
  } finally { reader.releaseLock(); }
}
