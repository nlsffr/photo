import { emptyAdPlacements, type AdConsent, type AdsConfig, type AdsRuntime, type AdsRuntimeReason } from './ads-contract';
export type AdsViewer = 'guest'|'member'|'premium'|'owner'|'unknown';
export function evaluateAdsRuntime(config:AdsConfig,consent:AdConsent,viewer:AdsViewer):AdsRuntime {
  let reason:AdsRuntimeReason = 'eligible';
  if (!config.enabled) reason='disabled';
  else if (viewer==='unknown') reason='unavailable';
  else if (viewer==='owner' || viewer==='premium') reason=viewer;
  else if (consent===null) reason='consent_required';
  else if (consent==='refused') reason='consent_refused';
  else if (!Object.values(config.placements).some(Boolean)) reason='disabled';
  const effectiveEnabled=reason==='eligible';
  return {enabled:config.enabled,effectiveEnabled,revision:config.revision,needsConsent:reason==='consent_required',
    consent,placements:effectiveEnabled ? {...config.placements} : emptyAdPlacements(),reason};
}
