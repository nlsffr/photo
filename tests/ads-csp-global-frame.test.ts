import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';

test('the observed global wrapper iframe is permitted by the actual main document CSP',async()=>{
 const{default:config}=loadAppModule<{default:{headers():Promise<Array<{headers:Array<{key:string;value:string}>}>>}}>('next.config.ts');
 const rules=await config.headers(),policy=rules.flatMap(r=>r.headers).find(h=>h.key==='Content-Security-Policy')?.value;
 assert.ok(policy);const frames=policy.split(';').map(s=>s.trim()).find(s=>s.startsWith('frame-src '))?.split(/\s+/).slice(1);
 assert.ok(frames?.includes('https://go.gasipedibexide.com'));
 assert.equal(frames?.includes('https://creative.gasipedibexide.com'),false,'an uncorrelated redirect-origin observation does not authorize another frame host');
 assert.equal(frames?.includes('https:'),false);assert.equal(frames?.some(v=>v.includes('*')),false);
});

test('the global wrapper origin gains no script/style/media privilege or arbitrary frame variants',()=>{
 const{ADS_CSP}=loadAppModule<{ADS_CSP:Record<string,readonly string[]>}>('src/lib/ads-csp.ts');
 assert.equal(ADS_CSP.frame.includes('https://go.gasipedibexide.com'),true);
 for(const key of ['script','style','media'])assert.equal(ADS_CSP[key].includes('https://go.gasipedibexide.com'),false);
 for(const invalid of ['http://go.gasipedibexide.com','https://go.gasipedibexide.com:8443','https://sub.go.gasipedibexide.com','https://go.gasipedibexide.com.evil.example','https://unrelated.example'])assert.equal(ADS_CSP.frame.includes(invalid),false);
 for(const value of ADS_CSP.frame)assert.match(value,/^https:\/\/[a-z0-9.-]+$/);
});

test('an ordinary advertising child already permits this HTTPS iframe independently of the parent correction',()=>{
 const{buildAdsEmbedDocument}=loadAppModule<{buildAdsEmbedDocument:(p:string,d:string)=>{csp:string}}>('src/lib/ads-embed-document.ts');
 const frames=buildAdsEmbedDocument('header','mobile').csp.split(';').map(s=>s.trim()).find(s=>s.startsWith('frame-src '));
 assert.equal(frames,"frame-src 'self' https:");
});
