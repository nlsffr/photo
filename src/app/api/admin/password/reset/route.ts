import {cookies} from 'next/headers';
import {SESSION_COOKIE,SESSION_TTL_DAYS,hashPassword,newSessionToken,sessionExpiry} from '@/lib/auth';
import {getDbPool} from '@/lib/db-pool';
import {isAdsEditorId} from '@/lib/ads-access';
import {hasSeoWriteOrigin,readSeoEditorJson,SeoEditorRequestError} from '@/lib/seo-editor-access';
import {resetAdminPassword,validPasswordResetInput,type PasswordResetDatabase} from '@/lib/admin-password-reset';
import {rateLimitRequest,sweep} from '@/lib/ratelimit';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});
export async function POST(request:Request) {
  if(!hasSeoWriteOrigin(request) || ['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??'')) return json({error:'forbidden'},403);
  sweep();
  if(!rateLimitRequest(request,{scope:'admin-password-reset',limit:5,peerLimit:100,windowMs:600_000}).allowed) return json({error:'rate_limited'},429);
  let input:unknown;
  try {input=await readSeoEditorJson(request);}
  catch(error){return json({error:'bad_request'},error instanceof SeoEditorRequestError?error.status:400);}
  if(!validPasswordResetInput(input)) return json({error:'bad_request'},400);
  const db=getDbPool();
  if(!db) return json({error:'unavailable'},503);
  const result=await resetAdminPassword(db as unknown as PasswordResetDatabase,input,{isAllowed:isAdsEditorId,hashPassword,newSessionToken,sessionExpiry});
  if(!result.ok) return json({error:result.error},result.error==='invalid'?410:503);
  (await cookies()).set(SESSION_COOKIE,result.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:SESSION_TTL_DAYS*86400});
  return json({ok:true});
}
