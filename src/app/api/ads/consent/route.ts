import { NextResponse } from 'next/server';
import { hasSeoWriteOrigin, readSeoEditorJson, SeoEditorRequestError } from '@/lib/seo-editor-access';
import { AD_CONSENT_COOKIE, AD_CONSENT_MAX_AGE, AD_CONSENT_VERSION } from '@/lib/ads-contract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'};
export async function POST(request:Request) {
  if (!hasSeoWriteOrigin(request) || ['cross-site','same-site'].includes(request.headers.get('sec-fetch-site')??'')) return NextResponse.json({error:'forbidden'},{status:403,headers});
  try {
    const input=await readSeoEditorJson(request);
    if (!input || typeof input!=='object' || Array.isArray(input)) return NextResponse.json({error:'invalid_request'},{status:400,headers});
    const value=input as Record<string,unknown>;
    if (Object.keys(value).some(key=>key!=='choice' && key!=='ageConfirmed' && key!=='version')
      || typeof value.choice!=='string' || !['accepted','refused'].includes(value.choice)
      || (value.choice==='accepted' && value.ageConfirmed!==true)
      || ('ageConfirmed' in value && typeof value.ageConfirmed!=='boolean')
      || ('version' in value && value.version!==AD_CONSENT_VERSION)) return NextResponse.json({error:'invalid_request'},{status:400,headers});
    const response=new NextResponse(null,{status:204,headers});
    response.cookies.set(AD_CONSENT_COOKIE,`${value.version??'v1'}:${value.choice}`,{path:'/',secure:process.env.NODE_ENV==='production',sameSite:'lax',httpOnly:false,maxAge:AD_CONSENT_MAX_AGE});
    return response;
  } catch(error) { return NextResponse.json({error:'invalid_request'},{status:error instanceof SeoEditorRequestError ? error.status : 400,headers}); }
}
