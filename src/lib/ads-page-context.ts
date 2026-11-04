import type { AdPlacement, AdProfile } from './ads-contract';
import type { AdDevice } from './ads-registry';
import type { AdSlotContext } from './ads-provider-plan';
// @ts-expect-error Native Node requires explicit suffixes.
import { isAdPagePath } from './ads-client-policy.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import { isSystemPath, resolveLocalizedPage, stripLocalePrefix, supportedLocaleForPath } from './i18n/config.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import { normalizeTagSlug } from './seo-policy.ts';

export type AdPageKind = 'home' | 'models' | 'creator' | 'media' | 'feed' | 'gallery' | 'rankings' | 'editorial';
export type AdPageContext = {kind: AdPageKind; pathname: string; collection?: 'overview' | 'photos' | 'videos' | 'popular'};

/** Public template identity only: never a vendor URL, arbitrary pageKind or database lookup. */
export function resolveAdPageContext(path: unknown): AdPageContext | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.length > 1024
    || /[\u0000-\u0020\u007f?#\\]/.test(path) || /%(?:2f|5c)/i.test(path)
    || new URL(path, 'https://leakfanhub.com').pathname !== path || (path.length > 1 && path.endsWith('/')) || path.includes('//')) return null;
  try { if (path.split('/').some(part => ['.', '..'].includes(decodeURIComponent(part)))) return null; } catch { return null; }
  const {pathname, locale} = stripLocalePrefix(path);
  if (stripLocalePrefix(pathname).locale || isSystemPath(pathname) || !isAdPagePath(path)) return null;
  const route = resolveLocalizedPage(supportedLocaleForPath(locale ?? 'en', pathname), pathname);
  const tag = /^\/tag\/([^/]+)$/.exec(pathname);
  if (!route) return tag && normalizeTagSlug(tag[1]) === tag[1] ? {kind: 'gallery', pathname} : null;
  if (route.kind === 'creator') return {kind: 'creator', pathname, collection: route.collection};
  if (route.kind === 'media') return {kind: 'media', pathname};
  if (pathname === '/') return {kind: 'home', pathname};
  if (pathname === '/models' || pathname === '/influenceuses-tendances') return {kind: 'models', pathname};
  if (pathname === '/classements') return {kind: 'rankings', pathname};
  if (pathname === '/feed') return {kind: 'feed', pathname};
  if (['/trending-medias', '/most-liked', '/random/medias', '/recherche', '/pour-toi'].includes(pathname)) return {kind: 'gallery', pathname};
  return {kind: 'editorial', pathname};
}

/** A logical header can use another owned, ready format without changing its placement gate. */
export function adFormatPlacementFor(profile: AdProfile | undefined, placement: AdPlacement, device: AdDevice, page?: AdPageContext): AdPlacement {
  return profile === 'intensive' && placement === 'header' && device === 'mobile' && page?.kind === 'creator' ? 'underVideo' : placement;
}

export function isAdSlotForPage(placement: 'header' | 'footer' | 'underVideo' | 'feed', context: AdSlotContext, page: AdPageContext): boolean {
  if (context === 'pause') return placement === 'underVideo' && page.kind === 'media';
  return placement === 'feed' ? page.kind === 'feed' : page.kind !== 'feed';
}
