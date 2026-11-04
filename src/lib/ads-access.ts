import 'server-only';
import { getSeoEditorSessionUser } from './seo-editor-access';

// Advertising ownership must not expand when the legacy SEO editor gains users.
export function isAdsEditorId(id:string):boolean {
  const owners=(process.env.SEO_EDITOR_USER_IDS??'').split(',').map(value=>value.trim()).filter(Boolean);
  return Boolean(id) && owners.length===1 && owners[0]===id;
}
export async function getAdsEditorUser() {
  const user=await getSeoEditorSessionUser();
  return user && isAdsEditorId(user.id) ? user : null;
}
