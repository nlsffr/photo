/**
 * Creator SEO aliases — LeakGallery exact first, then dense typo variants.
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

/** Dense keyboard / spelling variants — more than LG for long-tail */
export function generateTypoAliases(handle: string): string[] {
  const h = handle.toLowerCase().trim();
  if (h.length < 3) return [];
  const out = new Set<string>();

  const add = (v: string) => {
    if (v.length >= 3 && v.length <= 42 && v !== h) out.add(v);
  };

  // drop each char
  for (let i = 0; i < h.length; i++) add(h.slice(0, i) + h.slice(i + 1));
  // double each char
  for (let i = 0; i < h.length; i++) add(h.slice(0, i) + h[i] + h.slice(i));
  // adjacent transpose
  for (let i = 0; i < h.length - 1; i++) {
    add(h.slice(0, i) + h[i + 1] + h[i] + h.slice(i + 2));
  }
  // insert common letters in middle positions
  const inserts = ["a", "e", "i", "o", "u", "n", "r", "s", "y"];
  for (let i = 1; i < h.length && out.size < 40; i++) {
    for (const ch of inserts) add(h.slice(0, i) + ch + h.slice(i));
  }
  // vowel / lookalike swaps
  const pairs: [RegExp, string][] = [
    [/i/g, "y"],
    [/y/g, "i"],
    [/ph/g, "f"],
    [/f/g, "ph"],
    [/er/g, "ar"],
    [/ar/g, "er"],
    [/ai/g, "ay"],
    [/ay/g, "ai"],
    [/ie/g, "ei"],
    [/ei/g, "ie"],
    [/ll/g, "l"],
    [/nn/g, "n"],
    [/ss/g, "s"],
    [/ck/g, "k"],
    [/k/g, "ck"],
  ];
  for (const [re, rep] of pairs) {
    if (re.test(h)) add(h.replace(re, rep));
  }
  // trailing variations
  if (h.endsWith("n") && !h.endsWith("nn")) add(h + "n");
  if (h.endsWith("nn")) add(h.slice(0, -1));
  if (!h.endsWith("s")) add(h + "s");
  if (h.endsWith("s")) add(h.slice(0, -1));
  if (!h.endsWith("x")) add(h + "x");
  if (!h.endsWith("xx")) add(h + "xx");
  if (!h.endsWith("of")) add(h + "of");
  // underscore / dot noise stripped variants already plain

  return [...out].slice(0, 40);
}

export function getLeakGalleryAliases(handle: string): string[] {
  const k = handle.toLowerCase().trim();
  const list = LG_MAP[k] || LG_MAP[handle] || [];
  return Array.isArray(list) ? list.map(String) : [];
}

/** LG exact + extras — always try to reach MIN_ALIASES */
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
  // 1) exact LG
  for (const a of getLeakGalleryAliases(primary)) push(a);
  // 2) any stored
  for (const a of stored || []) push(a);
  // 3) dense typos until MIN then up to MAX
  for (const a of generateTypoAliases(primary)) {
    if (list.length >= MAX_ALIASES) break;
    push(a);
  }
  // pad if still short (rare short handles)
  while (list.length < Math.min(MIN_ALIASES, MAX_ALIASES)) {
    const pad = `${primary}${list.length}`;
    if (seen.has(pad)) break;
    push(pad);
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
