import { revalidatePath } from "next/cache";
import {
  getSeoEditorSessionUser, isSeoEditorId, hasSeoWriteOrigin,
  readSeoEditorJson, SeoEditorRequestError,
} from "@/lib/seo-editor-access";
import { listSeoEntries, saveSeoEntry, validateSeoSave } from "@/lib/seo-editor-store";
import { SEO_PAGES } from "@/lib/seo-editor-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", Vary: "Cookie" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE_HEADERS });

async function authorize() {
  const user = await getSeoEditorSessionUser();
  if (!user) return { response: json({ error: "unauthorized" }, 401) };
  if (!isSeoEditorId(user.id)) return { response: json({ error: "forbidden" }, 403) };
  return { user };
}

export async function GET() {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;
    return json({ entries: await listSeoEntries() });
  } catch { return json({ error: "unavailable" }, 503); }
}

export async function PUT(request: Request) {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;
    if (!hasSeoWriteOrigin(request)) return json({ error: "forbidden" }, 403);
    const input = validateSeoSave(await readSeoEditorJson(request));
    if (!input) return json({ error: "invalid_request" }, 400);
    const result = await saveSeoEntry(input, auth.user!.id);
    if (!result.ok) return json({ error: result.error }, result.error === "conflict" ? 409 : 503);
    const path = SEO_PAGES.find((page) => page.key === input.page)!.path;
    try {
      revalidatePath(`/${input.locale}${path === "/" ? "" : path}`);
      if (input.locale === "en") revalidatePath(path);
    } catch {
      // The database transaction is committed: retain its revision so the
      // client does not mistake a cache refresh problem for an unsaved edit.
      return json({ entry: result.entry, publicationPending: true });
    }
    return json({ entry: result.entry });
  } catch (error) {
    if (error instanceof SeoEditorRequestError) return json({ error: "invalid_request" }, error.status);
    return json({ error: "unavailable" }, 503);
  }
}
