import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {loadAppModule} from './helpers/load-app-module.ts';
test('the observed mobile advertising video origin is allowed for media only',()=>{
 const {ADS_CSP}=loadAppModule<{ADS_CSP:Record<string,string[]>}>('src/lib/ads-csp.ts');
 assert.ok(ADS_CSP.media.includes('https://video.sacdnssedge.com'));
 for(const key of ['script','connect','image','frame'])assert.equal(ADS_CSP[key].includes('https://video.sacdnssedge.com'),false);
 for(const value of ADS_CSP.media)assert.match(value,/^https:\/\/[a-z0-9.-]+$/);
});
