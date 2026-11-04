import 'server-only';
import { cookies } from 'next/headers';
import type { RowDataPacket } from 'mysql2';
import { SESSION_COOKIE } from './auth';
import { getSessionUser } from './auth-db';
import { isSeoEditorId } from './seo-editor-access';
import { getDbPool } from './db-pool';
import { premiumEntitlementState } from './premium-entitlement';
import { getAdsConfig } from './ads-store';
import { isAdsRegistryReady } from './ads-registry-data.mjs';
import { AD_CONSENT_COOKIE, emptyAdPlacements, parseAdConsent, type AdsRuntime } from './ads-contract';
import { evaluateAdsRuntime, type AdsViewer } from './ads-runtime-policy';

// Keep advertising eligibility read-only; isUserPremium also expires stale subscription rows.
export async function getAdsViewer(token:string|undefined):Promise<AdsViewer> {
  if (!token) return 'guest';
  try {
    const user=await getSessionUser(token);
    if (!user) return 'unknown';
    if (isSeoEditorId(user.id)) return 'owner';
    const db=getDbPool();
    if (!db) return 'unknown';
    const [rows]=await db.execute<RowDataPacket[]>(`SELECT u.is_premium,
      (SELECT MAX(s.current_period_end) FROM subscriptions s WHERE s.user_id=u.id AND s.status='active') AS period_end
      FROM users u WHERE u.id=? LIMIT 1`,[user.id]);
    const row=rows[0];
    if (!row || ![0,1].includes(row.is_premium)) return 'unknown';
    if (!row.is_premium) return 'member';
    if (!row.period_end || !Number.isFinite(new Date(row.period_end).getTime())) return 'unknown';
    return premiumEntitlementState({isPremium:true,periodEnd:row.period_end})==='active' ? 'premium' : 'member';
  } catch { return 'unknown'; }
}
export async function getAdsRuntime():Promise<AdsRuntime> {
  let consent:AdsRuntime['consent']=null;
  try {
    const jar=await cookies();
    consent=parseAdConsent(jar.get(AD_CONSENT_COOKIE)?.value);
    const config=await getAdsConfig();
    if (!config.enabled) return evaluateAdsRuntime(config,consent,'unknown');
    const viewer=await getAdsViewer(jar.get(SESSION_COOKIE)?.value);
    return evaluateAdsRuntime(config,consent,isAdsRegistryReady(config.placements) ? viewer : 'unknown');
  } catch {
    return {enabled:false,effectiveEnabled:false,revision:0,needsConsent:false,consent,placements:emptyAdPlacements(),reason:'unavailable',profile:'current'};
  }
}
