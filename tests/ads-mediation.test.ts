import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {probeAdMediation} from '../src/lib/ads-mediation.ts';

test('a declined visitor causes no resource request', async()=>{
  assert.equal(await probeAdMediation(()=>false,new AbortController().signal),null);
});

test('availability is probed without executing a vendor script; only an explicit network failure selects the alternative',async t=>{
  const previous={document:globalThis.document,window:globalThis.window};
  let appended=0,removed=0,timer:(()=>void)|undefined;
  const link={rel:'',as:'',href:'',relList:{supports:()=>true},onload:null as null|(()=>void),onerror:null as null|(()=>void),remove:()=>{removed++;}};
  Object.assign(globalThis,{document:{createElement:(tag:string)=>{assert.equal(tag,'link');return link;},head:{appendChild:()=>{appended++;}}},window:{setTimeout:(callback:()=>void)=>{timer=callback;return 1;},clearTimeout:()=>{}}});
  t.after(()=>Object.assign(globalThis,previous));
  const normal=probeAdMediation(()=>true,new AbortController().signal);assert.equal(link.rel,'preload');assert.equal(link.as,'script');link.onload?.();assert.equal(await normal,'standard');
  const failed=probeAdMediation(()=>true,new AbortController().signal);link.onerror?.();assert.equal(await failed,'alternative');
  const slow=probeAdMediation(()=>true,new AbortController().signal);timer?.();assert.equal(await slow,'standard');
  const abort=new AbortController();const cancelled=probeAdMediation(()=>true,abort.signal);abort.abort();assert.equal(await cancelled,null);
  let permitted=true;const stale=probeAdMediation(()=>permitted,new AbortController().signal);permitted=false;link.onload?.();assert.equal(await stale,null);
  assert.equal(appended,5);assert.equal(removed,5);assert.equal(link.onload,null);assert.equal(link.onerror,null);
});
