import type { PhotoView } from "./types";

export const HOME_SOURCE_WEIGHT = 0.75;
export const HOME_FRESHNESS_WEIGHT = 0.17;
export const HOME_EXPLORATION_WEIGHT = 0.08;
export const HOME_LOCAL_BOOST_CAP = 0.03;
export const HOME_DIVERSITY_WINDOW = 24;
export const HOME_CREATOR_CAP = 2;

type HomeRankOptions = {
  seed: number;
  seenIds?: ReadonlySet<string>;
};

function finiteMetric(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

function hashUnit(id: string, seed: number): number {
  let hash = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4_294_967_296;
}

function sourceEngagement(item: PhotoView): number {
  const views = finiteMetric(item.sourceViews ?? item.views);
  const likes = finiteMetric(item.sourceLikes ?? item.likes);
  return Math.log1p(views + likes * 12);
}

function scoreItems(items: PhotoView[], seed: number) {
  const maximumSource = Math.max(1, ...items.map(sourceEngagement));
  return items.map((item) => {
    const sourceScore = sourceEngagement(item) / maximumSource;
    const ageDays = Math.max(0, finiteMetric(item.ageMinutes)) / 1440;
    const freshness = Math.exp(-ageDays / 30);
    const exploration = hashUnit(item.id, seed);
    const local = Math.min(
      1,
      Math.log1p(finiteMetric(item.localViews)) / Math.log1p(10_000),
    );
    return {
      item,
      score:
        sourceScore * HOME_SOURCE_WEIGHT +
        freshness * HOME_FRESHNESS_WEIGHT +
        exploration * HOME_EXPLORATION_WEIGHT +
        local * HOME_LOCAL_BOOST_CAP,
    };
  });
}

function pickCandidate(
  remaining: ReturnType<typeof scoreItems>,
  output: PhotoView[],
  creatorCounts: Map<string, number>,
): number {
  const withinDiversityWindow = output.length < HOME_DIVERSITY_WINDOW;
  const eligible = (entry: (typeof remaining)[number]) =>
    !withinDiversityWindow ||
    (creatorCounts.get(entry.item.creatorHandle) ?? 0) < HOME_CREATOR_CAP;

  const eligibleIndexes = remaining
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => eligible(entry));
  const choices = eligibleIndexes.length > 0
    ? eligibleIndexes
    : remaining.map((entry, index) => ({ entry, index }));

  if (output.length >= 4 && output.length < 8) {
    const recentType = output[output.length - 1]?.type;
    const sameTypeRun = output.slice(-4).every((item) => item.type === recentType);
    if (sameTypeRun) {
      const alternate = choices.find(({ entry }) => entry.item.type !== recentType);
      if (alternate) return alternate.index;
    }
  }

  return choices[0]?.index ?? 0;
}

/** Deterministic ranking over a bounded SQL candidate pool. */
export function rankHomeFeed(
  candidates: PhotoView[],
  { seed, seenIds = new Set<string>() }: HomeRankOptions,
): PhotoView[] {
  const unique = new Map<string, PhotoView>();
  for (const item of candidates) {
    if (!seenIds.has(item.id) && !unique.has(item.id)) unique.set(item.id, item);
  }

  const remaining = scoreItems([...unique.values()], seed).sort(
    (left, right) =>
      right.score - left.score || left.item.id.localeCompare(right.item.id),
  );
  const output: PhotoView[] = [];
  const creatorCounts = new Map<string, number>();

  while (remaining.length > 0) {
    const index = pickCandidate(remaining, output, creatorCounts);
    const [selected] = remaining.splice(index, 1);
    if (!selected) break;
    output.push(selected.item);
    creatorCounts.set(
      selected.item.creatorHandle,
      (creatorCounts.get(selected.item.creatorHandle) ?? 0) + 1,
    );
  }

  return output;
}

function randomHomeSeed(): number {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    return values[0] ?? 0;
  }
  return Math.floor(Math.random() * 4_294_967_296);
}

export function resolveHomeSeed(
  value: unknown,
  create: () => number = randomHomeSeed,
): number {
  const numeric = Number(value);
  return (Number.isFinite(numeric) ? Math.trunc(numeric) : Math.trunc(create())) >>> 0;
}

type Identified = { id: string };

export function appendUniqueHomeItems<T extends Identified>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const seen = new Set(current.map((item) => item.id));
  const result = [...current];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export function paginateHomeFeed<T extends Identified>(
  ranked: readonly T[],
  options: { cursor: number | null; limit: number; seed: number },
): { items: T[]; nextCursor: number | null; total: number; seed: number } {
  const unique = appendUniqueHomeItems<T>([], ranked);
  const cursor = Math.max(0, Math.trunc(options.cursor ?? 0));
  const limit = Math.max(1, Math.trunc(options.limit));
  const items = unique.slice(cursor, cursor + limit);
  const nextCursor = cursor + items.length < unique.length
    ? cursor + items.length
    : null;
  return { items, nextCursor, total: unique.length, seed: options.seed };
}
