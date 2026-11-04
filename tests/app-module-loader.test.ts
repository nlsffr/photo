import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { NextConfig } from 'next';
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from './helpers/load-app-module.ts';
test('route harness loads the real ESM registry reached by shared localized renderers',()=>{
  const registry=loadAppModule<{ADS_REGISTRY:{header:{desktop:{kind:string}}};isAdsRegistryReady(placements:unknown):boolean}>('src/lib/ads-registry-data.mjs');
  assert.equal(registry.ADS_REGISTRY.header.desktop.kind,'banner');
  assert.equal(registry.isAdsRegistryReady({header:true}),true);
});

test('the real Next config resolves its own file URL and environment while retaining actual advertising CSP',async t=>{
  const before={CDN_HOSTNAME:process.env.CDN_HOSTNAME,NODE_ENV:process.env.NODE_ENV};
  Object.assign(process.env,{CDN_HOSTNAME:'cdn.fixture.invalid',NODE_ENV:'production'});
  t.after(()=>{for(const [key,value] of Object.entries(before)){if(value===undefined)Reflect.deleteProperty(process.env,key);else process.env[key]=value;}});
  const {default:config}=loadAppModule<{default:NextConfig}>('next.config.ts');
  assert.equal(config.turbopack?.root,fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''));
  const rules=await config.headers!();
  const csp=rules.flatMap(rule=>rule.headers).find(header=>header.key==='Content-Security-Policy')!.value;
  assert.ok(csp.includes('https://cdn.fixture.invalid'));assert.ok(!csp.includes("'unsafe-eval'"));
  const {ADS_CSP}=loadAppModule<{ADS_CSP:{script:string[];frame:string[]}}>('src/lib/ads-csp.ts');
  for(const host of [...ADS_CSP.script,...ADS_CSP.frame])assert.ok(csp.includes(host),host);
  const folder=mkdtempSync(join(tmpdir(),'locale-module-url-'));
  t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const filename=join(folder,'fixture.ts');
  writeFileSync(filename,'export const url = import.meta.url; export const literal = "import.meta.url";');
  const fixture=loadAppModule<{url:string;literal:string}>(filename);
  assert.equal(fixture.url,pathToFileURL(filename).href);assert.equal(fixture.literal,'import.meta.url');
});
