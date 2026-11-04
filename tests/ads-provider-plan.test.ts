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

test("each profile chooses exactly one provider and preserves the existing TrafficStars header/global formats", () => {
  for (const device of ["desktop", "mobile"] as const) {
    for (const profile of ["current", "balanced", "intensive"] as const) {
      for (const placement of ["header", "popunder", "interstitial", "slider"] as const) assert.equal(selectAdProvider({ profile, placement, device }), "trafficstars");
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
  for (const ordinal of [0, 1, 1000000]) { assert.equal(choice("current", ordinal), "trafficstars"); assert.equal(choice("intensive", ordinal), "exoclick"); }
});

test("only intensive's paused video selects the nonlinear Exo zone; invalid or ambiguous selections fail closed", () => {
  for (const profile of ["current", "balanced", "intensive"] as const) assert.equal(selectAdProvider({ profile, placement: "underVideo", device: "desktop", context: "pause" }), profile === "intensive" ? "exoclick" : null);
  for (const changes of [
    { profile: "unknown" }, { placement: "unknown" }, { device: "tablet" }, { context: "unknown" },
    { context: "pause", placement: "header" }, { placement: "feed" }, { ordinal: 0 },
    ...[-1, 1.5, 1000001, null].map(ordinal => ({ placement: "feed", ordinal })),
  ]) assert.equal(selectAdProvider({ profile: "balanced", placement: "footer", device: "desktop", ...changes } as never), null);
});
