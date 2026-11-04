import type { AdPlacement, AdPlacements } from "./ads-contract";
import * as registry from "./ads-registry-data.mjs";

export type AdDevice = "desktop" | "mobile";
export type AdSpot = { kind: "banner" | "feed" | "popunder" | "interstitial" | "slider"; spotId: string; width?: number | string; height?: number; scriptUrl?: string; domain?: string; styleUrl?: string;
  generatedScriptUrl?: string; inFeed?: boolean; sessionDuration?: number; count?: number; firstDelay?: number; delay?: number; mode?: string; devices?: string;
  countdown?: number; countClicks?: number; cookieExpires?: number; mobileWidth?: string; displayMode?: string; cappedAction?: string; cappedValueInMinutes?: number; showCTAButton?: boolean; hideOnComplete?: boolean; closeButtonDelay?: number };
export const ADS_REGISTRY = registry.ADS_REGISTRY as Record<AdPlacement, Record<AdDevice, AdSpot>>;
export const missingAdsPlacements = (placements: AdPlacements): AdPlacement[] => registry.missingAdsPlacements(placements) as AdPlacement[];
export const isAdsRegistryReady: (placements: AdPlacements) => boolean = registry.isAdsRegistryReady;
export const isValidAdSpot: (spot: AdSpot) => boolean = registry.isValidAdSpot;
