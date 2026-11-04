import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { selectAdProvider } from "../src/lib/ads-provider-plan.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { getExoclickSpot } from "../src/lib/exoclick-registry.ts";

test("the registry contains the publisher's exact created zones and generated VAST parameter spelling", () => {
  for (const [placement, device, zoneId, width, height] of [
    ["header", "desktop", 6074782, 728, 90], ["header", "mobile", 6074820, 300, 100], ["footer", "desktop", 6074784, 728, 90],
    ["footer", "mobile", 6074788, 300, 250], ["underVideo", "desktop", 6074786, 300, 250],
    ["underVideo", "mobile", 6074790, 300, 250],
  ] as const) assert.deepEqual(getExoclickSpot(placement, device), { kind: "banner", zoneId, width, height });
  for (const device of ["desktop", "mobile"] as const) {
    assert.deepEqual(getExoclickSpot("underVideo", device, "pause"), { kind: "nonlinear", zoneId: 6074792, width: 300, height: 250,
      tagUrl: "https://s.magsrv.com/v1/vast.php?idz=6074792", sourceHosts: ["s.magsrv.com"] });
    assert.deepEqual(getExoclickSpot("feed", device), { kind: "linear", zoneId: 6074810,
      tagUrl: "https://s.magsrv.com/v1/vast.php?idzone=6074810", sourceHosts: ["s.magsrv.com"] });
  }
  assert.equal(getExoclickSpot("popunder", "desktop"), null);
});

test("each profile keeps its owned banner providers and enforces allowed global formats", () => {
  for (const device of ["desktop", "mobile"] as const) {
    for (const profile of ["current", "balanced", "intensive"] as const) {
      for (const placement of ["header", "popunder", "interstitial", "slider"] as const) {
        const allowed=placement==="header"||profile==="intensive"||(profile==="balanced"&&placement!=="interstitial");
        assert.equal(selectAdProvider({ profile, placement, device }), allowed?"trafficstars":null);
      }
    }
    assert.equal(selectAdProvider({ profile: "current", placement: "footer", device }), "exoclick");
    assert.equal(selectAdProvider({ placement: "underVideo", device }), "trafficstars");
    assert.equal(selectAdProvider({ profile: "balanced", placement: "footer", device }), "exoclick");
    assert.equal(selectAdProvider({ profile: "balanced", placement: "underVideo", device }), "exoclick");
    assert.equal(selectAdProvider({ profile: "intensive", placement: "footer", device }), "trafficstars");
    assert.equal(selectAdProvider({ profile: "intensive", placement: "underVideo", device }), "trafficstars");
  }
});

test("feed alternation is deterministic from its stable zero-based slot ordinal", () => {
  const choice = (profile: "current" | "balanced" | "intensive", ordinal: number) => selectAdProvider({ profile, placement: "feed", device: "mobile", ordinal });
  assert.deepEqual(Array.from({ length: 6 }, (_, ordinal) => choice("balanced", ordinal)), ["trafficstars", "exoclick", "trafficstars", "exoclick", "trafficstars", "exoclick"]);
  for (const ordinal of [0, 1, 1000000]) { assert.equal(choice("current", ordinal), null); assert.equal(choice("intensive", ordinal), "trafficstars"); }
});

test('only intensive has an explicit standard/alternative feed branch and an undecided state remains closed',()=>{
  for(const device of ['desktop','mobile'] as const)for(const mediation of ['standard','alternative'] as const){
    assert.equal(selectAdProvider({profile:'intensive',placement:'feed',device,ordinal:0,mediation}),mediation==='standard'?'trafficstars':'exoclick');
    assert.equal(selectAdProvider({profile:'intensive',placement:'underVideo',device,context:'pause',mediation}),'exoclick');
    assert.equal(selectAdProvider({profile:'intensive',placement:'header',device,mediation}),'trafficstars');
  }
  for(const profile of ['current','balanced'] as const)for(const mediation of ['standard','alternative'] as const){
    assert.equal(selectAdProvider({profile,placement:'feed',device:'mobile',ordinal:0,mediation}),null);
  }
  for(const mediation of [null,'unknown',true,0])assert.equal(selectAdProvider({profile:'intensive',placement:'feed',device:'mobile',ordinal:0,mediation} as never),null);
});

test('intensive alternative selects Exo interstitial and slider, while popunder remains TrafficStars',()=>{
  for(const device of ['desktop','mobile'] as const){
    for(const placement of ['interstitial','slider'] as const){
      assert.equal(selectAdProvider({profile:'intensive',placement,device,mediation:'standard'}),'trafficstars');
      assert.equal(selectAdProvider({profile:'intensive',placement,device,mediation:'alternative'}),'exoclick');
      assert.equal(getExoclickSpot(placement,device),null,'Globals have no HTTP iframe/registry route.');
    }
    assert.equal(selectAdProvider({profile:'intensive',placement:'popunder',device,mediation:'alternative'}),'trafficstars');
  }
});

test("only intensive's paused video selects the nonlinear Exo zone; invalid or ambiguous selections fail closed", () => {
  for (const profile of ["current", "balanced", "intensive"] as const) assert.equal(selectAdProvider({ profile, placement: "underVideo", device: "desktop", context: "pause" }), profile === "intensive" ? "exoclick" : null);
  for (const changes of [
    { profile: "unknown" }, { placement: "unknown" }, { device: "tablet" }, { context: "unknown" },
    { context: "pause", placement: "header" }, { placement: "feed" }, { ordinal: 0 },
    ...[-1, 1.5, 1000001, null].map(ordinal => ({ placement: "feed", ordinal })),
  ]) assert.equal(selectAdProvider({ profile: "balanced", placement: "footer", device: "desktop", ...changes } as never), null);
});
