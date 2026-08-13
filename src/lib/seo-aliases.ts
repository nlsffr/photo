/**
 * Creator SEO aliases — LeakGallery list first, then extra typo variants.
 */
import lgAliasesJson from "@/data/creator-aliases.json";

const MAX_ALIASES = 20;

const LG_MAP: Record<string, string[]> =
  (lgAliasesJson as { aliases?: Record<string, string[]> })?.aliases ||
  (lgAliasesJson as Record<string, string[]>);

/** Common keyboard / spelling variants of a handle */
export function generateTypoAliases(handle: string): string[] {
  const h = handle.toLowerCase().trim();
  if (h.length < 3) return [];
  const out = new Set<string>();

  for (let i = 0; i < h.length; i++) {
    const v = h.slice(0, i) + h.slice(i + 1);
    if (v.length >= 3) out.add(v);
  }
  for (let i = 0; i < h.length; i++) {
    out.add(h.slice(0, i) + h[i] + h.slice(i));
  }
  for (let i = 0; i < h.length - 1; i++) {
    out.add(h.slice(0, i) + h[i + 1] + h[i] + h.slice(i + 2));
  }
  if (h.includes("i")) out.add(h.replace(/i/g, "y"));
  if (h.includes("y")) out.add(h.replace(/y/g, "i"));
  if (h.endsWith("n") && !h.endsWith("nn")) out.add(h + "n");
  if (h.endsWith("nn")) out.add(h.slice(0, -1));
  if (h.includes("er")) out.add(h.replace("er", "ar"));
  if (h.includes("ar")) out.add(h.replace("ar", "er"));
  // a/ai / ie swaps common on OF handles
  if (h.includes("ai")) out.add(h.replace(/ai/g, "a"));
  if (h.includes("ie")) out.add(h.replace(/ie/g, "ei"));

  out.delete(h);
  return [...out].filter((v) => v.length >= 3 && v.length <= 40);
}

/** LG exact aliases for a handle (case-insensitive key) */
export function getLeakGalleryAliases(handle: string): string[] {
  const k = handle.toLowerCase().trim();
  const list = LG_MAP[k] || LG_MAP[handle] || [];
  return Array.isArray(list) ? list.map(String) : [];
}

/** Merge: name + handle + LG aliases + stored + typos (deduped) */
export function buildAliasList(
  handle: string,
  name?: string | null,
  stored?: string[] | null,
): string[] {
  const primary = handle.trim();
  const seen = new Set<string>([primary.toLowerCase()]);
  const list: string[] = [];

  const push = (raw: string) => {
    const t = raw.trim();
    if (!t || t.length < 2) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    list.push(t);
  };

  if (name && name.toLowerCase() !== primary.toLowerCase()) push(name);
  // Exact LeakGallery aliases first (quality)
  for (const a of getLeakGalleryAliases(primary)) push(a);
  for (const a of stored || []) push(a);
  // Extra typos they may not have
  for (const a of generateTypoAliases(primary)) push(a);

  return list.slice(0, MAX_ALIASES);
}

export function creatorSeoTitle(handle: string, name: string, aliases: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const p of [name || handle, handle, ...aliases]) {
    const t = (p || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(t);
  }
  return `${parts.join(" / ")} / Exclusive Leaked Nude OnlyFans`;
}

export function creatorSeoDescription(handle: string, name: string): string {
  return `You can find all the exclusive content of ${name || handle} here. LeakFanHub is the best free OnlyFans Leaks website. We have the best content you won't find anywhere else.`;
}

export function mediaSeoTitle(
  handle: string,
  name: string,
  aliases: string[],
  sourceId: string,
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const p of [name || handle, ...aliases]) {
    const t = (p || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(t);
  }
  const head = parts.slice(0, 12).join(" / ");
  return `${head} Exclusive Leaked Nude OnlyFans #${sourceId}`;
}

export function mediaSeoDescription(title: string): string {
  return title.length > 160 ? `${title.slice(0, 157)}...` : title;
}
