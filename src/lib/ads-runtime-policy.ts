import { emptyAdPlacements, effectiveAdPlacements, isAdProfile, type AdConsent, type AdsConfig, type AdsRuntime, type AdsRuntimeReason } from './ads-contract';
export type AdsViewer = 'guest'|'member'|'premium'|'owner'|'unknown';
export function evaluateAdsRuntime(config:AdsConfig,consent:AdConsent,viewer:AdsViewer):AdsRuntime {
  const profile=config.profile===undefined ? 'current' : config.profile;
  if(!isAdProfile(profile))throw new Error('invalid_ad_profile');
  const placements=effectiveAdPlacements(profile,config.placements);
  let reason:AdsRuntimeReason = 'eligible';
  if (!config.enabled || !Object.values(placements).some(Boolean)) reason='disabled';
  else if (viewer==='unknown') reason='unavailable';
  else if (viewer==='owner' || viewer==='premium') reason=viewer;
  else if (consent===null) reason='consent_required';
  else if (consent==='refused') reason='consent_refused';
  const effectiveEnabled=reason==='eligible';
  return {enabled:config.enabled,effectiveEnabled,revision:config.revision,needsConsent:reason==='consent_required',
    consent,placements:effectiveEnabled ? placements : emptyAdPlacements(),reason,profile};
}
