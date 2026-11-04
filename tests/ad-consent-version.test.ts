import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { AD_CONSENT_VERSION, parseAdConsent } from "../src/lib/ads-contract.ts";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const { isConsentChoiceRequest } = loadAppModule<{ isConsentChoiceRequest: (value: unknown) => boolean }>("src/lib/consent-choice-contract.ts");
const { adsCopy } = loadAppModule<{ adsCopy: Record<string, { body: string }> }>("src/lib/ads-copy.ts");
test("every separate advertising explanation discloses both providers", () => {
  assert.equal(Object.keys(adsCopy).length, 12);
  for (const [locale, copy] of Object.entries(adsCopy)) {
    assert.match(copy.body, /TrafficStars/, locale); assert.match(copy.body, /ExoClick/, locale);
  }
});
test("only an explicit current-version acceptance authorizes both advertising providers", () => {
  assert.equal(AD_CONSENT_VERSION, "v2");
  for (const value of ["v2:accepted", "v2%3Aaccepted"]) assert.equal(parseAdConsent(value), "accepted");
  for (const value of ["v1:accepted", "v1%3Aaccepted", "v0:accepted", "accepted", "%broken"]) assert.equal(parseAdConsent(value), null);
});
test("a refusal remains a refusal across the version upgrade without requiring another ad choice", () => {
  for (const value of ["v1:refused", "v1%3Arefused", "v2:refused", "v2%3Arefused"]) assert.equal(parseAdConsent(value), "refused");
});
test("the combined contract recognizes explicit v2, preserves versionless legacy forms, and rejects unknown purposes or versions", () => {
  const current = { choice: "accepted", advertisingChoice: "accepted", ageConfirmed: true, version: "v2" };
  assert.equal(isConsentChoiceRequest(current), true);
  assert.equal(isConsentChoiceRequest({ choice: "accepted", advertisingChoice: "accepted", ageConfirmed: true }), true);
  assert.equal(isConsentChoiceRequest({ choice: "accepted" }), true);
  for (const version of ["v1", "v3", 2, null, {}]) assert.equal(isConsentChoiceRequest({ ...current, version }), false);
  assert.equal(isConsentChoiceRequest({ choice: "accepted", version: "v2" }), false);
});

type Route = { POST: (request: Request) => Promise<Response> };
const site = "https://consent-version.example";
const beforeSite = process.env.NEXT_PUBLIC_SITE_URL;
test.beforeEach(() => { process.env.NEXT_PUBLIC_SITE_URL = site; });
test.afterEach(() => { if (beforeSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = beforeSite; });
function route(path: string) { return loadAppModule<Route>(`src/app/api/${path}/route.ts`, { "server-only": {}, "next/headers": {}, "./auth-db": {} }); }
function request(path: string, body: unknown) { return new Request(`${site}/api/${path}`, { method: "POST", headers: { origin: site, "content-type": "application/json" }, body: JSON.stringify(body) }); }
const adCookie = (response: Response) => response.headers.getSetCookie().find(value => value.startsWith("lfh_ad_consent=")) ?? "";

for (const path of ["cookies/choice", "ads/consent"]) {
  const body = path === "cookies/choice" ? { choice: "accepted", advertisingChoice: "accepted", ageConfirmed: true } : { choice: "accepted", ageConfirmed: true };
  test(`${path}: an already-open old TrafficStars-only form never acquires v2 consent`, async () => {
    const response = await route(path).POST(request(path, body)); assert.equal(response.status, 204);
    assert.match(adCookie(response), /^lfh_ad_consent=v1%3Aaccepted;/);
    assert.doesNotMatch(adCookie(response), /v2/);
    assert.equal(parseAdConsent(adCookie(response).split(";")[0].slice("lfh_ad_consent=".length)), null);
    if (path === "cookies/choice") assert.ok(response.headers.getSetCookie().some(value => value.startsWith("lfh_audience=accepted;")));
  });
  test(`${path}: the newly disclosed v2 form records one current cookie`, async () => {
    const response = await route(path).POST(request(path, { ...body, version: "v2" })); assert.equal(response.status, 204);
    assert.match(adCookie(response), /^lfh_ad_consent=v2%3Aaccepted;/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(await response.text(), "");
  });
  test(`${path}: unsupported versions reject atomically without issuing any consent cookies`, async () => {
    for (const version of ["v1", "v3", null, true]) {
      const response = await route(path).POST(request(path, { ...body, version }));
      assert.equal(response.status, 400); assert.equal(response.headers.getSetCookie().length, 0);
    }
  });
  test(`${path}: both old and current refusals are honored without an age-confirmation prerequisite`, async () => {
    const refused = path === "cookies/choice" ? { choice: "refused", advertisingChoice: "refused" } : { choice: "refused" };
    for (const version of [undefined, "v2"]) {
      const response = await route(path).POST(request(path, { ...refused, ...(version ? { version } : {}) })); assert.equal(response.status, 204);
      assert.equal(parseAdConsent(adCookie(response).split(";")[0].slice("lfh_ad_consent=".length)), "refused");
    }
  });
}
