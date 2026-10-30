type RemovalMarked = {
  removedFromIndexAt?: string | null;
};

type VersionedRemovalMarked = RemovalMarked & {
  urlVersion?: number | null;
};

export type CreatorRouteDecision = "serve" | "missing" | "gone";

export function isRemovedContent(
  entity: RemovalMarked | null | undefined,
): boolean {
  return Boolean(entity?.removedFromIndexAt);
}
/** A removal marker wins over every URL version, including the current one. */
export function creatorRouteDecision(
  creator: VersionedRemovalMarked | null | undefined,
  requestedVersion: number | null,
): CreatorRouteDecision {
  if (!creator) return "missing";
  if (isRemovedContent(creator)) return "gone";
  const parsed = Number(creator.urlVersion ?? 1);
  const current = Number.isInteger(parsed) && parsed > 1 ? parsed : 1;
  const isCanonical =
    current === 1 ? requestedVersion == null : requestedVersion === current;
  return isCanonical ? "serve" : "missing";
}
