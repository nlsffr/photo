import { getSeoEditorSessionUser, hasSeoWriteOrigin, readSeoEditorJson, SeoEditorRequestError } from '@/lib/seo-editor-access';
import { isAdsEditorId } from '@/lib/ads-access';
import { getAdsConfig, putAdsConfig, validateAdsSave } from '@/lib/ads-store';
import { isAdsRegistryReady, missingAdsPlacements } from '@/lib/ads-registry-data.mjs';
import type { AdsConfig } from '@/lib/ads-contract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
const result=(config:AdsConfig)=>({config,ready:isAdsRegistryReady(config.placements),missing:missingAdsPlacements(config.placements)});
async function authorize() {
  const user=await getSeoEditorSessionUser();
  if (!user) return {response:json({error:'unauthorized'},401)};
  if (!isAdsEditorId(user.id)) return {response:json({error:'forbidden'},403)};
  return {user};
}
export async function GET() {
  try {
    const auth=await authorize(); if (auth.response) return auth.response;
    return json(result(await getAdsConfig()));
  } catch { return json({error:'unavailable'},503); }
}
export async function PUT(request:Request) {
  try {
    const auth=await authorize(); if (auth.response) return auth.response;
    if (!hasSeoWriteOrigin(request) || ['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??'')) return json({error:'forbidden'},403);
    const input=validateAdsSave(await readSeoEditorJson(request));
    if (!input) return json({error:'invalid_request'},400);
    const saved=await putAdsConfig(input,auth.user!.id);
    if (!saved.ok) return json({error:saved.error},saved.error==='conflict' ? 409 : saved.error==='not_ready' || saved.error==='invalid_request' ? 400 : 503);
    return json(result(saved.config));
  } catch (error) {
    return json({error:error instanceof SeoEditorRequestError ? 'invalid_request' : 'unavailable'},error instanceof SeoEditorRequestError ? error.status : 503);
  }
}
