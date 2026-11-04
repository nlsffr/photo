import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {EXOCLICK_PREROLL_SPOT,getExoclickPrerollSpot} from '../src/lib/exoclick-preroll-registry.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import {getExoclickSpot} from '../src/lib/exoclick-registry.ts';

test('the dedicated own In-Stream zone uses its exact generated idz tag on both supported devices',()=>{
 for(const device of ['desktop','mobile'] as const){
  const spot=getExoclickPrerollSpot(device);assert.equal(spot,EXOCLICK_PREROLL_SPOT);assert.equal(spot.kind,'linear');
  assert.equal(spot.zoneId,6075526);assert.equal(spot.tagUrl,'https://s.magsrv.com/v1/vast.php?idz=6075526');assert.deepEqual(spot.sourceHosts,['s.magsrv.com']);
  assert.notEqual(spot.zoneId,getExoclickSpot('feed',device)?.zoneId);assert.notEqual(spot.zoneId,getExoclickSpot('underVideo',device,'pause')?.zoneId);
 }
 assert.ok(Object.isFrozen(EXOCLICK_PREROLL_SPOT));assert.ok(Object.isFrozen(EXOCLICK_PREROLL_SPOT.sourceHosts));
});
test('no arbitrary device or source input can select another zone',()=>{
 for(const device of ['tablet','Mobile','https://attacker.test',undefined,null])assert.equal(getExoclickPrerollSpot(device as never),null);
});
