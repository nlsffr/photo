import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import { LOCALES, chooseLocale, localePath, localeAlternates, resolveLocalizedPage } from '../src/lib/i18n/config.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import { isReservedCreatorHandle } from '../src/lib/seo-policy.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import { isAdPagePath } from '../src/lib/ads-client-policy.ts';

const added = ['ru','zh','ja','hi','th'] as const;
test('all twelve published languages negotiate regional browser tags and expose stable discovery URLs',()=>{
  assert.deepEqual(LOCALES,['en','fr','es','de','it','pt','nl',...added]);
  for(const locale of added){
    assert.equal(chooseLocale(null,`${locale}-XX,fr;q=0.5`),locale);
    assert.equal(chooseLocale(locale,'en-US'),locale);
    assert.equal(localePath(locale,'/models?page=2#items'),`/${locale}/models?page=2#items`);
    assert.equal(localeAlternates('/models')[locale],`/${locale}/models`);
    assert.deepEqual(resolveLocalizedPage(locale,'/models'),{kind:'static',pathname:'/models'});
    assert.equal(localePath(locale,'/synthetic-creator/123-v2'),'/synthetic-creator/123-v2');
    assert.ok(isReservedCreatorHandle(locale),`${locale} namespace must never be an imported creator`);
    assert.equal(isAdPagePath(`/${locale}/premium`),false);
    assert.equal(isAdPagePath(`/${locale}/admin/ads`),false);
    assert.equal(isAdPagePath(`/${locale}/models`),true);
  }
});
