import type {AdDevice} from "./ads-registry";

/** Exact Get Code tag from our active site 89019 Pre/Post Roll solution.
 * Both modes intentionally use this dedicated zone; no visitor input selects it.
 */
export const TRAFFICSTARS_ROLL_SPOT=Object.freeze({
  kind:"linear" as const,
  solutionId:5213625,
  leafId:5213624,
  tagUrl:"https://fozekikikiminu.com/do2/dcefbcef2f5448d08fef0d7d710492be/vast",
  sourceHosts:Object.freeze(["fozekikikiminu.com"]),
});

function reportingSpot(mode:"preroll"|"postroll",device:AdDevice) {
  return Object.freeze({...TRAFFICSTARS_ROLL_SPOT,
    tagUrl:TRAFFICSTARS_ROLL_SPOT.tagUrl+`?subid=lfh_intensive_${mode}_${device}`,
  });
}
const SPOTS=Object.freeze({
  preroll:Object.freeze({desktop:reportingSpot("preroll","desktop"),mobile:reportingSpot("preroll","mobile")}),
  postroll:Object.freeze({desktop:reportingSpot("postroll","desktop"),mobile:reportingSpot("postroll","mobile")}),
});

export function getTrafficStarsRollSpot(device:AdDevice,mode:"preroll"|"postroll") {
  return ["desktop","mobile"].includes(device)&&Object.hasOwn(SPOTS,mode)?SPOTS[mode][device]:null;
}
