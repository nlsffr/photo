import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native Node requires explicit suffixes.
import {TRAFFICSTARS_ROLL_SPOT,getTrafficStarsRollSpot} from '../src/lib/trafficstars-roll-registry.ts';
// @ts-expect-error Native Node requires explicit suffixes.
import {EXOCLICK_PREROLL_SPOT} from '../src/lib/exoclick-preroll-registry.ts';

test('both rolls use only our exact dedicated active TrafficStars VAST tag on either device',()=>{
 for(const device of ['desktop','mobile'] as const)for(const mode of ['preroll','postroll'] as const){
  const spot=getTrafficStarsRollSpot(device,mode);
  assert.ok(spot);assert.equal(spot,getTrafficStarsRollSpot(device,mode));assert.equal(spot.kind,'linear');
  assert.equal(spot.solutionId,5213625);assert.equal(spot.leafId,5213624);
  assert.equal(spot.tagUrl,TRAFFICSTARS_ROLL_SPOT.tagUrl+'?subid=lfh_intensive_'+mode+'_'+device);
  assert.deepEqual(spot.sourceHosts,['fozekikikiminu.com']);
  assert.notEqual(spot.tagUrl,EXOCLICK_PREROLL_SPOT.tagUrl);assert.ok(Object.isFrozen(spot));
 }
 assert.ok(Object.isFrozen(TRAFFICSTARS_ROLL_SPOT));assert.ok(Object.isFrozen(TRAFFICSTARS_ROLL_SPOT.sourceHosts));
});
test('neither a client device nor provider URL can select an arbitrary roll zone',()=>{
 for(const device of ['tablet','Mobile','https://attacker.test',undefined,null])assert.equal(getTrafficStarsRollSpot(device as never,'preroll'),null);
 for(const mode of ['feed','preRoll','postroll&secret=x',undefined,null])assert.equal(getTrafficStarsRollSpot('mobile',mode as never),null);
 assert.equal(EXOCLICK_PREROLL_SPOT.zoneId,6075526);
});
