/**
 * Creator SEO aliases — LeakGallery exact first, then realistic typos.
 * Always aims for ≥12 unique names in titles.
 */
import lgAliasesJson from "@/data/creator-aliases.json";

const MAX_ALIASES = 18;
const MIN_ALIASES = 12;

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

/** QWERTY neighbors for realistic mistypes */
const NEIGH: Record<string, string> = {
  a: "sqwz", b: "vghn", c: "xdfv", d: "sfrecx",
  e: "wrsdf", f: "dgrtcv", g: "fhtybv", h: "gjyunb",
  i: "ujko", j: "hkui nm", k: "jloi", l: "kop",
  m: "njk", n: "bhjm", o: "iklp", p: "ol",
  q: "wa", r: "edft", s: "awedxz", t: "rfgy",
  u: "yhij", v: "cfgb", w: "qase", x: "zsdc",
  y: "tghu", z: "asx",
};

/** Realistic spelling mistakes people actually type */
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

  // --- HIGH priority: end-of-name mistakes (most common) ---
  add(h + h[h.length - 1]); // double last letter
  add(h.slice(0, -1)); // miss last letter
  if (h.length > 4) add(h.slice(0, -2));
  if (!h.endsWith("s")) add(h + "s");
  if (h.endsWith("s")) add(h.slice(0, -1));
  if (h.endsWith("n") && !h.endsWith("nn")) add(h + "n");
  if (h.endsWith("nn")) add(h.slice(0, -1));
  if (h.endsWith("e")) add(h.slice(0, -1));
  else add(h + "e");
  if (!h.endsWith("x")) add(h + "x");
  if (!h.endsWith("xx")) add(h + "xx");
  if (!h.endsWith("of")) add(h + "of");
  if (!h.endsWith("_of")) add(h + "_of");

  // --- phonetic / common spelling ---
  if (h.includes("i")) add(h.replace(/i/g, "y"));
  if (h.includes("y")) add(h.replace(/y/g, "i"));
  if (h.includes("ph")) add(h.replace(/ph/g, "f"));
  if (h.includes("f") && !h.includes("ph")) add(h.replace(/f/g, "ph"));
  if (h.includes("er")) add(h.replace(/er/g, "ar"));
  if (h.includes("ar")) add(h.replace(/ar/g, "er"));
  if (h.includes("ai")) add(h.replace(/ai/g, "ay"));
  if (h.includes("ay")) add(h.replace(/ay/g, "ai"));
  if (h.includes("ie")) add(h.replace(/ie/g, "ei"));
  if (h.includes("ei")) add(h.replace(/ei/g, "ie"));
  if (h.includes("ll")) add(h.replace(/ll/g, "l"));
  if (h.includes("nn")) add(h.replace(/nn/g, "n"));
  if (h.includes("ss")) add(h.replace(/ss/g, "s"));
  if (h.includes("ck")) add(h.replace(/ck/g, "k"));
  // single → double in middle (corina → corinna style)
  for (let i = 1; i < h.length - 1; i++) {
    const c = h[i];
    if ("aeioulnrs".includes(c) && h[i - 1] !== c && h[i + 1] !== c) {
      add(h.slice(0, i) + c + h.slice(i));
    }
  }

  // --- adjacent transpose (middle, not first char only) ---
  for (let i = 1; i < h.length - 1; i++) {
    add(h.slice(0, i) + h[i + 1] + h[i] + h.slice(i + 2));
  }

  // --- drop one letter (prefer middle/end, skip index 0 first wave) ---
  for (let i = h.length - 1; i >= 1; i--) {
    add(h.slice(0, i) + h.slice(i + 1));
  }
  // drop first letter last (less common search)
  add(h.slice(1));

  // --- keyboard neighbor substitution (middle letters) ---
  for (let i = 1; i < h.length; i++) {
    const n = NEIGH[h[i]] || "";
    for (const ch of n) {
      if (out.length > 50) break;
      add(h.slice(0, i) + ch + h.slice(i + 1));
    }
  }

  // --- double one letter (middle) ---
  for (let i = 1; i < h.length; i++) {
    add(h.slice(0, i) + h[i] + h.slice(i));
  }

  return out;
}

export function getLeakGalleryAliases(handle: string): string[] {
  const k = handle.toLowerCase().trim();
  const list = LG_MAP[k] || LG_MAP[handle] || [];
  return Array.isArray(list) ? list.map(String) : [];
}

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
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    list.push(t);
  };

  if (name && name.toLowerCase() !== primary.toLowerCase()) push(name);
  for (const a of getLeakGalleryAliases(primary)) push(a);
  for (const a of stored || []) push(a);
  for (const a of generateTypoAliases(primary)) {
    if (list.length >= MAX_ALIASES) break;
    push(a);
  }

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
  const head = parts.slice(0, 14).join(" / ");
  return `${head} Exclusive Leaked Nude OnlyFans #${sourceId}`;
}

export function mediaSeoDescription(title: string): string {
  return title.length > 160 ? `${title.slice(0, 157)}...` : title;
}
