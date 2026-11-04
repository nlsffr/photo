import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import { ADS_CSP } from '../src/lib/ads-csp.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import { buildAdsEmbedDocument } from '../src/lib/ads-embed-document.ts';

// Sanitized origins from the authorized live browser observation; no ad calls.
const sliderWrapper='https://go.gasipedibexide.com';
const nativeApi='https://go.lanitesasexige.com';
const impressionPixel='https://pxl-eu.tsyndicate.com';
const nativeHls='https://edge-hls.saawsedge.com';
const nativeHlsSegments='https://media-hls.saawsedge.com';
const avatarImage='https://static-proxy.strpst.com';
const sliderVideo='https://tsvideo.sacdnssedge.com';
const has=(values:readonly string[],origin:string)=>values.includes(origin);

test('the observed wrapper retains connection/image privileges without script/media access',()=>{
  assert.equal(has(ADS_CSP.connect,sliderWrapper),true);
  assert.equal(has(ADS_CSP.script,sliderWrapper),false);
  assert.equal(has(ADS_CSP.image,sliderWrapper),true);
  assert.equal(has(ADS_CSP.media,sliderWrapper),false);
});
test('the observed regional TrafficStars impression pixel is allowed only as an image',()=>{
  assert.equal(has(ADS_CSP.image,impressionPixel),true);
  assert.equal(has(ADS_CSP.connect,impressionPixel),false);
  assert.equal(has(ADS_CSP.script,impressionPixel),false);
});
test('the NativeAdPreview model API is restricted to advertising documents',()=>{
  const child=ADS_CSP.embedConnect;
  assert.equal(has(child,nativeApi),true);
  assert.equal(has(ADS_CSP.connect,nativeApi),false);
  assert.equal(has(ADS_CSP.script,nativeApi),false);
});
test('the actual HTTP advertising document wires the child-only connection allowance',()=>{
  const directives=buildAdsEmbedDocument('header','mobile').csp.split(';').map(value=>value.trim());
  const connect=directives.find(value=>value.startsWith('connect-src '));
  assert.ok(connect);
  assert.ok(connect.split(' ').includes(nativeApi));
  for(const origin of ADS_CSP.connect)assert.ok(connect.split(' ').includes(origin));
  assert.equal(has(ADS_CSP.connect,nativeApi),false);
});
test('NativeAdPreview HLS requests are allowed only inside the advertising document',()=>{
  const directives=buildAdsEmbedDocument('header','mobile').csp.split(';').map(value=>value.trim());
  const connect=directives.find(value=>value.startsWith('connect-src '));
  assert.ok(connect);
  assert.ok(connect.split(' ').includes(nativeHls));
  assert.equal(has(ADS_CSP.embedConnect,nativeHls),true);
  for(const parent of [ADS_CSP.connect,ADS_CSP.script,ADS_CSP.image,ADS_CSP.media])assert.equal(has(parent,nativeHls),false);
});
test('the observed slider avatar host is permitted only for images in the main page',()=>{
  assert.equal(has(ADS_CSP.image,avatarImage),true);
  for(const other of [ADS_CSP.connect,ADS_CSP.script,ADS_CSP.media,ADS_CSP.frame])assert.equal(has(other,avatarImage),false);
});
test('the observed slider MP4 CDN is permitted only for media in the main page',()=>{
  assert.equal(has(ADS_CSP.media,sliderVideo),true);
  for(const other of [ADS_CSP.connect,ADS_CSP.script,ADS_CSP.image,ADS_CSP.frame])assert.equal(has(other,sliderVideo),false);
});
test('the live-origin correction does not grant wildcard or arbitrary HTTPS access in the main page',()=>{
  for(const values of Object.values(ADS_CSP))for(const source of values)assert.ok(/^https:\/\/[a-z0-9.-]+$/.test(source),source);
  for(const unrelated of ['http://go.gasipedibexide.com','https://go.gasipedibexide.com:8443','https://sub.go.gasipedibexide.com','https://unrelated.example'])assert.equal(has(ADS_CSP.connect,unrelated),false);
});

test('the variant origin from the successful HLS master is restricted to child connections',()=>{
  const connect=buildAdsEmbedDocument('header','mobile').csp.split(';').find(value=>value.trim().startsWith('connect-src '));
  assert.ok(connect?.split(' ').includes(nativeHlsSegments));
  assert.equal(has(ADS_CSP.embedConnect,nativeHlsSegments),true);
  for(const parent of [ADS_CSP.connect,ADS_CSP.script,ADS_CSP.image,ADS_CSP.media,ADS_CSP.frame])assert.equal(has(parent,nativeHlsSegments),false);
});

test('the HLS decoder may create a blob worker only inside the advertising child',()=>{
  const directives=buildAdsEmbedDocument('header','desktop').csp.split(';').map(value=>value.trim());
  assert.equal(directives.find(value=>value.startsWith('worker-src ')), 'worker-src blob:');
  assert.equal(Object.hasOwn(ADS_CSP,'worker'),false);
  assert.doesNotMatch(directives.find(value=>value.startsWith('script-src ')) ?? '', /blob:/);
});
