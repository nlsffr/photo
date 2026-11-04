import type { AdPlacement } from "./ads-contract";
import type { AdDevice } from "./ads-registry";
import type { AdSlotContext } from "./ads-provider-plan";

type Banner = { kind: "banner"; zoneId: number; width: number; height: number };
type Vast = { kind: "linear" | "nonlinear"; zoneId: number; tagUrl: string; sourceHosts: readonly string[]; width?: number; height?: number };
export type ExoclickSpot = Banner | Vast;

const pause: Vast = { kind: "nonlinear", zoneId: 6074792, width: 300, height: 250,
  tagUrl: "https://s.magsrv.com/v1/vast.php?idz=6074792", sourceHosts: ["s.magsrv.com"] };
const feed: Vast = { kind: "linear", zoneId: 6074810,
  tagUrl: "https://s.magsrv.com/v1/vast.php?idzone=6074810", sourceHosts: ["s.magsrv.com"] };

/** Public publisher IDs generated in our ExoClick account; no keys or competitor code. */
export const EXOCLICK_REGISTRY = {
  header: { desktop: { kind: "banner", zoneId: 6074782, width: 728, height: 90 }, mobile: { kind: "banner", zoneId: 6074820, width: 300, height: 100 } },
  footer: { desktop: { kind: "banner", zoneId: 6074784, width: 728, height: 90 }, mobile: { kind: "banner", zoneId: 6074788, width: 300, height: 250 } },
  underVideo: { desktop: { kind: "banner", zoneId: 6074786, width: 300, height: 250 }, mobile: { kind: "banner", zoneId: 6074790, width: 300, height: 250 } },
  pause: { desktop: pause, mobile: pause }, feed: { desktop: feed, mobile: feed },
} as const;

function ready(spot: ExoclickSpot): boolean {
  if (!Number.isSafeInteger(spot.zoneId) || spot.zoneId < 1) return false;
  if (spot.kind === "banner") return [[728, 90], [300, 100], [300, 250]].some(([width, height]) => spot.width === width && spot.height === height);
  return spot.sourceHosts.length === 1 && spot.sourceHosts[0] === "s.magsrv.com"
    && (spot.kind === "linear" ? spot.tagUrl === `https://s.magsrv.com/v1/vast.php?idzone=${spot.zoneId}`
      : spot.kind === "nonlinear" && spot.width === 300 && spot.height === 250 && spot.tagUrl === `https://s.magsrv.com/v1/vast.php?idz=${spot.zoneId}`);
}

export function getExoclickSpot(placement: AdPlacement, device: AdDevice, context: AdSlotContext = "page"): ExoclickSpot | null {
  if (!["desktop", "mobile"].includes(device) || !["page", "pause"].includes(context)) return null;
  let spot: ExoclickSpot;
  if (context === "pause") { if (placement !== "underVideo") return null; spot = EXOCLICK_REGISTRY.pause[device]; }
  else {
    if (!["header", "footer", "underVideo", "feed"].includes(placement)) return null;
    spot = EXOCLICK_REGISTRY[placement as "header" | "footer" | "underVideo" | "feed"][device];
  }
  return ready(spot) ? spot : null;
}
