import type { PhotoView } from "./types";

export interface ScoredPhoto {
  photo: PhotoView;
  score: number;
  /** Human explanation for why it was recommended (or null). */
  reason: string | null;
}

function variety(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

/**
 * Rank photos for a "Pour toi" feed from the viewer's own interactions.
 * Pure + deterministic given the same inputs. `hasTaste` is false on cold start.
 */
export function personalizeFeed(
  items: PhotoView[],
  liked: Set<string>,
  saved: Set<string>,
  followed: Set<string>,
): { list: ScoredPhoto[]; hasTaste: boolean } {
  const engaged = new Set<string>([...liked, ...saved]);

  // Build taste profile from engaged photos.
  const tagWeight = new Map<string, number>();
  const likedCreators = new Map<string, number>();
  for (const p of items) {
    if (!engaged.has(p.id)) continue;
    for (const t of p.tags) tagWeight.set(t, (tagWeight.get(t) ?? 0) + 1);
    likedCreators.set(
      p.creatorHandle,
      (likedCreators.get(p.creatorHandle) ?? 0) + 1,
    );
  }

  const hasTaste = followed.size > 0 || engaged.size > 0;

  const list: ScoredPhoto[] = items.map((p) => {
    let score = p.trending * 0.15; // popularity baseline
    let reason: string | null = null;

    if (followed.has(p.creatorHandle)) {
      score += 60;
      reason = `Parce que tu suis ${p.creator.name}`;
    }

    const lc = likedCreators.get(p.creatorHandle) ?? 0;
    if (lc > 0) {
      score += 18 * lc;
      if (!reason) reason = `Tu aimes le travail de ${p.creator.name}`;
    }

    let tagScore = 0;
    let bestTag = "";
    let bestWeight = 0;
    for (const t of p.tags) {
      const w = tagWeight.get(t) ?? 0;
      tagScore += w;
      if (w > bestWeight) {
        bestWeight = w;
        bestTag = t;
      }
    }
    score += tagScore * 9;
    if (!reason && bestWeight > 0) reason = `Parce que tu aimes #${bestTag}`;

    // Deprioritise things already liked so the feed stays fresh.
    if (liked.has(p.id)) score -= 45;

    score += variety(p.id) * 0.06; // gentle shuffle for ties

    return { photo: p, score, reason };
  });

  list.sort((a, b) => b.score - a.score);
  return { list, hasTaste };
}
