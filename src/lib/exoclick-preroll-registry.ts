import type {AdDevice} from "./ads-registry";

/** Exact tag generated for our dedicated In-Stream zone, not the feed zone. */
export const EXOCLICK_PREROLL_SPOT=Object.freeze({
  kind:"linear" as const,
  zoneId:6075526,
  tagUrl:"https://s.magsrv.com/v1/vast.php?idz=6075526",
  sourceHosts:Object.freeze(["s.magsrv.com"]),
});

export function getExoclickPrerollSpot(device:AdDevice) {
  return ["desktop","mobile"].includes(device)?EXOCLICK_PREROLL_SPOT:null;
}
