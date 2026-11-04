import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
// @ts-expect-error Native Node requires explicit suffixes.
import {buildAdsEmbedDocument} from '../src/lib/ads-embed-document.ts';

test('the advertising HTTP document uses only registered code and hashes its fixed bootstrap',()=>{
  const result=buildAdsEmbedDocument('header','desktop');
  const boot=result.html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(boot);
  const hash=createHash('sha256').update(boot).digest('base64');
  assert.ok(result.csp.includes(`'sha256-${hash}'`));
  assert.match(result.csp,/frame-ancestors 'self'/);
  assert.match(result.csp,/img-src 'self' data: https:/);
  assert.match(result.html,/cdn\.fozekikikiminu\.com/);
  assert.match(result.html,/lfh_ad_consent=/);
  assert.doesNotMatch(result.html,/window\.open|document\.write|<[^>]+\sonload=/);
});
test('unrecognized embed parameters cannot become HTML or SDK input',()=>{
  for(const [placement,device] of [['<script>','desktop'],['header','mobile<script>'],['popunder','desktop']]) {
    assert.throws(()=>buildAdsEmbedDocument(placement as never,device as never));
  }
  assert.throws(()=>buildAdsEmbedDocument('header','mobile','injected<script>' as never));
});

test('embed profiles only add a public reporting category and keep the same publisher zones and consent guard',()=>{
  for(const profile of ['current','balanced','intensive'] as const){
    const result=buildAdsEmbedDocument('header','mobile',profile);
    assert.match(result.html,new RegExp(`"profile":"${profile}"`));
    assert.match(result.html,/ac23f7ff171648cf98eaede6374b9eb5/);
    assert.match(result.html,/lfh_ad_consent=/);assert.doesNotMatch(result.html,/unsafe-inline[^;]*script|document\.cookie\s*=/);
    const boot=result.html.match(/<script>([\s\S]*?)<\/script>/)![1];
    assert.ok(result.csp.includes(`'sha256-${createHash('sha256').update(boot).digest('base64')}'`));
  }
});

test('the HTTP bootstrap does not load a SDK after consent is absent or revoked',async()=>{
  const {runInNewContext}=await import('node:vm');
  const script=buildAdsEmbedDocument('header','desktop').html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const created:unknown[]=[];const messages:unknown[]=[];
  runInNewContext(script,{document:{cookie:'lfh_audience=accepted',createElement:()=>{created.push({});}},parent:{postMessage:(value:unknown)=>messages.push(value)},location:{origin:'https://example.test'}});
  assert.equal(created.length,0);assert.equal(messages.length,1);
});

test('the feed document can use a local SDK mock with normal same-origin storage',async()=>{
  const {runInNewContext}=await import('node:vm');
  const script=buildAdsEmbedDocument('feed','mobile').html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const scripts:Array<{src?:string;dataset:Record<string,string>;onload?:()=>void}>=[];
  const options:Array<Record<string,unknown>>=[];const messages:Array<{status:string}>=[];
  let observer:()=>void=()=>{};let filled=false;
  const root={id:'lfh-ad',appendChild:(value:typeof scripts[number])=>scripts.push(value),querySelector:()=>filled?{}:null};
  runInNewContext(script,{
    document:{cookie:'lfh_ad_consent=v1%3Aaccepted',getElementById:()=>root,createElement:()=>({dataset:{}})},
    location:{origin:'https://example.test'},parent:{postMessage:(value:{status:string})=>messages.push(value)},
    window:{TSVideoShorts:(value:Record<string,unknown>)=>{options.push(value);filled=true;}},
    MutationObserver:class {constructor(callback:()=>void){observer=callback;}observe(){}disconnect(){}},setTimeout:()=>0,
  });
  assert.equal(scripts.length,1);assert.equal(scripts[0].src,'https://cdn.tsyndicate.com/sdk/v1/video.shorts.js');
  scripts[0].onload?.();observer();
  assert.equal(options.length,1);assert.equal(options[0].inFeed,true);assert.equal(options[0].autoXu,false);
  assert.equal(options[0].domain,undefined);assert.equal(messages[0].status,'filled');
});
