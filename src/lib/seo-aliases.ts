/**
 * Creator SEO aliases — match LeakGallery density.
 * - If LG has aliases for this handle → use those exact ones (max 8)
 * - If not → add ~2 smart typos (LG average ≈ 2–3 names total including handle)
 * Title always starts with the real handle, then alternatives.
 */
import lgAliasesJson from "@/data/creator-aliases.json";

/** Max alternatives after the primary handle (LG extreme = sophieraiin with 7) */
const MAX_ALT_WHEN_LG = 7;
/** When no LG data: LG average total names ≈ 2.3 → ~1–2 alternatives */
const AVG_ALT_WHEN_EMPTY = 2;

const LG_MAP: Record<string, string[]> = (() => {
  const raw = lgAliasesJson as unknown as {
    aliases?: Record<string, string[]>;
  } & Record<string, string[]>;
  if (raw && typeof raw === "object" && raw.aliases && typeof raw.aliases === "object") {
    return raw.aliases;
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (k === "aliases") continue;
    if (Array.isArray(v)) out[k] = v.map(String);
  }
  return out;
})();

const NEIGH: Record<string, string> = {
  a: "sqwz", b: "vghn", c: "xdfv", d: "sfrecx",
  e: "wrsdf", f: "dgrtcv", g: "fhtybv", h: "gjyunb",
  i: "ujko", j: "hkuinm", k: "jloi", l: "kop",
  m: "njk", n: "bhjm", o: "iklp", p: "ol",
  q: "wa", r: "edft", s: "awedxz", t: "rfgy",
  u: "yhij", v: "cfgb", w: "qase", x: "zsdc",
  y: "tghu", z: "asx",
};

/** Realistic typos — prioritized for when we have no LG list */
export function generateTypoAliases(handle: string): string[] {
  const h = handle.toLowerCase().trim();
  if (h.length < 3) return [];
  const out: string[] = [];
  const seen = new Set<string>([h]);

  const add = (v: string) => {
    const t = v.toLowerCase();
    if (t.length < 3 || t.length > 42 || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  // end-of-name (most common real mistakes)
  add(h + h[h.length - 1]);
  add(h.slice(0, -1));
  if (!h.endsWith("s")) add(h + "s");
  if (h.endsWith("s") && h.length > 4) add(h.slice(0, -1));
  if (h.endsWith("n") && !h.endsWith("nn")) add(h + "n");
  if (!h.endsWith("x")) add(h + "x");

  // phonetic
  if (h.includes("i")) add(h.replace(/i/g, "y"));
  if (h.includes("y") && !h.includes("i")) add(h.replace(/y/g, "i"));
  if (h.includes("er")) add(h.replace(/er/g, "ar"));
  if (h.includes("ai")) add(h.replace(/ai/g, "ay"));
  if (h.includes("ll")) add(h.replace(/ll/g, "l"));
  if (h.includes("nn")) add(h.replace(/nn/g, "n"));

  // one middle transpose
  for (let i = 1; i < h.length - 1; i++) {
    add(h.slice(0, i) + h[i + 1] + h[i] + h.slice(i + 2));
  }

  // drop one letter from end/middle
  for (let i = h.length - 1; i >= 1; i--) {
    add(h.slice(0, i) + h.slice(i + 1));
  }

  // keyboard neighbor on last char
  if (h.length > 2) {
    const last = h[h.length - 1];
    for (const ch of NEIGH[last] || "") {
      add(h.slice(0, -1) + ch);
    }
  }

  return out;
}

export function getLeakGalleryAliases(handle: string): string[] {
  const k = handle.toLowerCase().trim();
  const list = LG_MAP[k] || LG_MAP[handle] || [];
  return Array.isArray(list) ? list.map(String) : [];
}

/**
 * Alternatives only (NOT including primary handle).
 * LG exact list preferred; otherwise ~AVG_ALT_WHEN_EMPTY smart typos.
 */
export function buildAliasList(
  handle: string,
  name?: string | null,
  stored?: string[] | null,
): string[] {
  const primary = handle.trim();
  const primaryKey = primary.toLowerCase();
  const seen = new Set<string>([primaryKey]);
  const list: string[] = [];

  const push = (raw: string) => {
    const t = raw.trim();
    if (!t || t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(t);
  };

  // 1) Real display name if different
  if (name && name.toLowerCase() !== primaryKey) push(name);

  // 2) Exact LeakGallery aliases (priority)
  const lg = getLeakGalleryAliases(primary);
  for (const a of lg) push(a);

  // 3) Any stored extras
  for (const a of stored || []) push(a);

  if (lg.length > 0) {
    // Match LG: only their aliases (already pushed), hard cap
    return list.slice(0, MAX_ALT_WHEN_LG);
  }

  // No LG data → fill to average density with smart typos
  for (const a of generateTypoAliases(primary)) {
    if (list.length >= AVG_ALT_WHEN_EMPTY) break;
    push(a);
  }
  return list.slice(0, AVG_ALT_WHEN_EMPTY);
}

/** Title: real name/handle FIRST, then alternatives, then brand suffix */
export function creatorSeoTitle(handle: string, name: string, aliases: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  // Real handle / name first (correct spelling)
  for (const p of [handle, name]) {
    const t = (p || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(t);
  }
  // Then alternatives only
  for (const p of aliases) {
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
  for (const p of [handle, name, ...aliases]) {
    const t = (p || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(t);
  }
  const head = parts.slice(0, 6).join(" / ");
  return `${head} Exclusive Leaked Nude OnlyFans #${sourceId}`;
}

export function mediaSeoDescription(title: string): string {
  return title.length > 160 ? `${title.slice(0, 157)}...` : title;
}
