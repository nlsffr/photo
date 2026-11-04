import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node tests require explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
test('only the two exact advertising documents may supply their own SAMEORIGIN and hashed CSP',async()=>{
  const {default:config}=loadAppModule<{default:{headers():Promise<Array<{source:string;headers:Array<{key:string;value:string}>}>>}}>('next.config.ts');
  const rules=await config.headers();
  const protectedRule=rules.find(rule=>rule.headers.some(h=>h.key==='X-Frame-Options'))!;
  const match=/^\/:path\((.*)\)$/.exec(protectedRule.source)!;
  const regex=new RegExp('^/'+match[1]+'$');
  for(const path of ['/api/ads/embed','/api/ads/embed/','/api/ads/exoclick','/api/ads/exoclick/'])assert.equal(regex.test(path),false,path);
  for(const path of ['/','/admin/ads','/api/ads/runtime','/api/ads/exoclick/other','/api/ads/exoclick-evil','/api/ads/embed/file','/fr/api/ads/exoclick'])assert.equal(regex.test(path),true,path);
  assert.equal(protectedRule.headers.find(h=>h.key==='X-Frame-Options')?.value,'DENY');
  assert.match(protectedRule.headers.find(h=>h.key==='Content-Security-Policy')?.value??'',/frame-ancestors 'none'/);
});
