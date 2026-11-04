import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

type Route = { POST(request: Request): Promise<Response> };
const site = "https://consent-fixture.example";
const route = () => loadAppModule<Route>("src/app/api/cookies/choice/route.ts", {
  "server-only": {}, "next/headers": {}, "./auth-db": {},
});
const priorSite = process.env.NEXT_PUBLIC_SITE_URL;
const priorMode = process.env.NODE_ENV;
test.beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = site;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
});
test.afterEach(() => {
  if (priorSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = priorSite;
  if (priorMode === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV;
  else (process.env as Record<string, string | undefined>).NODE_ENV = priorMode;
});
function request(body: unknown, headers: Record<string, string> = {}, url = `${site}/api/cookies/choice`) {
  return new Request(url, { method: "POST", headers: { origin: site, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
function cookies(response: Response) { return response.headers.getSetCookie(); }
function cookie(response: Response, name: string) { return cookies(response).find(value => value.startsWith(`${name}=`)) ?? ""; }
function assertPrivate(response: Response) {
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
}

test("legacy analytics choices never create advertising consent, even with an accepted analytics cookie", async () => {
  for (const choice of ["accepted", "refused"]) {
    const response = await route().POST(request({ choice }, { cookie: "lfh_audience=accepted" }));
    assert.equal(response.status, 204);
    assert.match(cookie(response, "lfh_audience"), new RegExp(`^lfh_audience=${choice};`));
    assert.equal(cookie(response, "lfh_ad_consent"), "");
    assert.equal(Boolean(cookie(response, "lfh_visitor")), choice === "refused");
    if (choice === "refused") assert.match(cookie(response, "lfh_visitor"), /Max-Age=0/);
    assertPrivate(response);
  }
});

test("one combined acceptance returns both separate consent cookies only after explicit age confirmation", async () => {
  const response = await route().POST(request({ choice: "accepted", advertisingChoice: "accepted", ageConfirmed: true, version: "v2" }));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.equal(cookies(response).length, 2);
  assert.match(cookie(response, "lfh_audience"), /^lfh_audience=accepted;/);
  assert.match(cookie(response, "lfh_ad_consent"), /^lfh_ad_consent=v2%3Aaccepted;/);
  for (const value of cookies(response)) {
    assert.match(value, /Max-Age=15552000/);
    assert.match(value, /Path=\//);
    assert.match(value, /Secure/);
    assert.match(value, /SameSite=lax/i);
    assert.doesNotMatch(value, /HttpOnly/i);
  }
  assertPrivate(response);
});

test("combined refusal records both refusals and expires the analytics visitor identifier", async () => {
  const response = await route().POST(request({ choice: "refused", advertisingChoice: "refused", version: "v2" }));
  assert.equal(response.status, 204);
  assert.equal(cookies(response).length, 3);
  assert.match(cookie(response, "lfh_audience"), /^lfh_audience=refused;/);
  assert.match(cookie(response, "lfh_ad_consent"), /^lfh_ad_consent=v2%3Arefused;/);
  assert.match(cookie(response, "lfh_visitor"), /Max-Age=0/);
  assert.match(cookie(response, "lfh_visitor"), /HttpOnly/);
});

test("granular choices stay independent in both directions", async () => {
  for (const [choice, advertisingChoice] of [["accepted", "refused"], ["refused", "accepted"]]) {
    const response = await route().POST(request({ choice, advertisingChoice, ageConfirmed: true, version: "v2" }));
    assert.equal(response.status, 204);
    assert.match(cookie(response, "lfh_audience"), new RegExp(`^lfh_audience=${choice};`));
    assert.match(cookie(response, "lfh_ad_consent"), new RegExp(`^lfh_ad_consent=v2%3A${advertisingChoice};`));
    assert.equal(Boolean(cookie(response, "lfh_visitor")), choice === "refused");
  }
});

test("invalid combined bodies never partially update either consent", async () => {
  const invalid = [null, [], { advertisingChoice: "refused" }, { choice: "other", advertisingChoice: "refused" },
    { choice: "accepted", advertisingChoice: "accepted" },
    { choice: "accepted", advertisingChoice: "accepted", ageConfirmed: false },
    { choice: "accepted", advertisingChoice: "accepted", ageConfirmed: "true" },
    { choice: "accepted", advertisingChoice: "other", ageConfirmed: true },
    { choice: "accepted", advertisingChoice: ["accepted"], ageConfirmed: true },
    { choice: "accepted", advertisingChoice: "refused", ageConfirmed: null },
    { choice: "accepted", advertisingChoice: "refused", script: "unexpected" }];
  for (const body of invalid) {
    const response = await route().POST(request(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(cookies(response).length, 0);
    assertPrivate(response);
  }
});

test("combined consent rejects missing, foreign, noncanonical and cross-site origins without writing cookies", async () => {
  const body = { choice: "accepted", advertisingChoice: "accepted", ageConfirmed: true, version: "v2" };
  const requests = [request(body, { origin: "" }), request(body, { origin: "https://foreign.example" }),
    request(body, { origin: `${site}/path` }), request(body, { "sec-fetch-site": "cross-site" }),
    request(body, { "sec-fetch-site": "same-site" }), request(body, { origin: "https://forged.example" }, "https://forged.example/api/cookies/choice")];
  for (const incoming of requests) {
    const response = await route().POST(incoming);
    assert.equal(response.status, 403);
    assert.equal(cookies(response).length, 0);
    assertPrivate(response);
  }
});

test("combined consent requires JSON and retains the bounded-body limit", async () => {
  const body = { choice: "accepted", advertisingChoice: "accepted", ageConfirmed: true, version: "v2" };
  const plain = await route().POST(request(body, { "content-type": "text/plain" }));
  assert.equal(plain.status, 415);
  assert.equal(cookies(plain).length, 0);
  for (const incoming of [request(body, { "content-length": "129" }), request({ ...body, padding: "x".repeat(200) }),
    new Request(`${site}/api/cookies/choice`, { method: "POST", headers: { origin: site, "content-type": "application/json" }, body: "{" })]) {
    const response = await route().POST(incoming);
    assert.equal(response.status, 400);
    assert.equal(cookies(response).length, 0);
  }
});
