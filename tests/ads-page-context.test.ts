import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

const {resolveAdPageContext}=loadAppModule<{
  resolveAdPageContext(path:unknown):{kind:string;pathname:string;collection?:string}|null;
}>('src/lib/ads-page-context.ts');

test('public page contexts derive from exact route segments, including all locales and creator versions',()=>{
  const languages=['en','fr','es','de','it','pt','nl','ru','zh','ja','hi','th'];
  for(const prefix of ['',...languages.map(locale=>'/'+locale)]){
    assert.deepEqual(resolveAdPageContext(prefix+'/sample-v23/videos'),{kind:'creator',pathname:'/sample-v23/videos',collection:'videos'});
    assert.equal(resolveAdPageContext(prefix+'/sample-v23/123-v4')?.kind,'media');
    assert.equal(resolveAdPageContext(prefix+'/models')?.kind,'models');
    assert.equal(resolveAdPageContext(prefix+'/feedexample')?.kind,'creator');
  }
  for(const [path,kind] of [['/','home'],['/feed','feed'],['/trending-medias','gallery'],['/most-liked','gallery'],
    ['/random/medias','gallery'],['/recherche','gallery'],['/tag/example','gallery'],['/pour-toi','gallery'],
    ['/classements','rankings'],['/influenceuses-tendances','models'],['/about','editorial']])assert.equal(resolveAdPageContext(path)?.kind,kind,path);
});

test('private, system, malformed, nested-language and noncanonical paths never produce a public context',()=>{
  for(const path of [undefined,null,42,'','https://leakfanhub.com/sample','//sample','/fr/en/sample','/api/ads/runtime',
    '/fr/identite','/admin/ads','/premium','/connexion','/contact/support','/sitemap.xml','/sample/../models',
    '/%2e%2e/models','/sample%2fprivate','/sample%5cprivate','/sample//videos','/sample/','/sample?x=1',
    '/sample#section','/sample\\videos','/sample\n','/bad%escape','/sample/videos/extra'])assert.equal(resolveAdPageContext(path),null,String(path));
});
