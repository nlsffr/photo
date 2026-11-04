import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node requires explicit suffixes.
import { loadAppModule } from "./helpers/load-app-module.ts";

const placements = { header: true, footer: true, underVideo: true, feed: true, popunder: true, interstitial: true, slider: true };
const runtime = { enabled: true, effectiveEnabled: true, revision: 11, needsConsent: false, consent: "accepted", placements, reason: "eligible", profile: "current" };
type Options = { cookie?: string | null; runtime?: Record<string, unknown>; unavailable?: boolean; missingSpot?: boolean };
type Route = { GET: (request: Request) => Promise<Response> };
function setup(options: Options = {}) {
  let reads = 0;
  const route = loadAppModule<Route>("src/app/api/ads/exoclick/route.ts", {
    "server-only": {},
    "next/headers": { cookies: async () => ({ get: (key: string) => key === "lfh_ad_consent" && options.cookie !== null ? { value: options.cookie ?? "v2%3Aaccepted" } : undefined }) },
    "@/lib/ads-runtime": { getAdsRuntime: async () => { reads++; if (options.unavailable) throw new Error("private connection details"); return { ...runtime, ...options.runtime }; } },
    ...(options.missingSpot ? { "@/lib/exoclick-registry": { getExoclickSpot: () => null } } : {}),
  });
  return { route, reads: () => reads };
}
const defaults = { placement: "footer", device: "mobile", context: "page", profile: "current", nonce: "slot_11", path: "/models", locale: "fr" };
function request(changes: Record<string, string | null | undefined> = {}, headers: Record<string, string | undefined> = {}, origin = "https://leakfanhub.com") {
  const query = new URLSearchParams(defaults);
  for (const [key, value] of Object.entries(changes)) { if (value === null) query.delete(key); else if (value !== undefined) query.set(key, value); }
  const cleanHeaders = Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== undefined));
  return new Request(`${origin}/api/ads/exoclick?${query}`, { headers: cleanHeaders });
}

test("an eligible current footer emits only its registered banner document, privately and without external fetching", async t => {
  let external = 0; t.mock.method(globalThis, "fetch", async () => { external++; throw new Error("No creative may be fetched by the server."); });
  const response = await setup().route.GET(request()); assert.equal(response.status, 200);
  const html = await response.text(); assert.match(html, /idzone=6074788/); assert.match(html, /"nonce":"slot_11"/); assert.match(html, /"consentValue":"v2:accepted"/);
  assert.match(response.headers.get("cache-control") ?? "", /private, no-store/);
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/); assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'self'/); assert.equal(external, 0);
});

test("balanced under-video, odd feed and intensive pause/feed choose only their registered format", async () => {
  for (const [profile, changes, expected] of [
    ["balanced", { placement: "underVideo", path: "/sample/123" }, "idzone=6074790"],
    ["balanced", { placement: "feed", path: "/feed", ordinal: "1" }, "idzone=6074810"],
    ["intensive", { placement: "underVideo", context: "pause", path: "/sample/123" }, "idz=6074792"],
    ["intensive", { placement: "feed", path: "/feed", ordinal: "0", mediation:"alternative" }, "idzone=6074810"],
  ] as const) {
    const response = await setup({ runtime: { profile } }).route.GET(request({ profile, ...changes }));
    assert.equal(response.status, 200); assert.ok((await response.text()).includes(expected));
  }
});

test('the Exo endpoint accepts intensive alternative feed only while pause remains Exo in either branch',async()=>{
  const changes={profile:'intensive',placement:'feed',path:'/feed',ordinal:'0'};
  for(const mediation of [undefined,'standard','alternative']){
    const response=await setup({runtime:{profile:'intensive'}}).route.GET(request({...changes,mediation}));
    assert.equal(response.status,mediation==='alternative'?200:403);
  }
  for(const mediation of ['standard','alternative'])assert.equal((await setup({runtime:{profile:'intensive'}}).route.GET(request({profile:'intensive',placement:'underVideo',context:'pause',path:'/sample/123',mediation}))).status,200);
  for(const mediation of ['unknown','null','']){
    const api=setup({runtime:{profile:'intensive'}});assert.equal((await api.route.GET(request({...changes,mediation}))).status,400);assert.equal(api.reads(),0);
  }
  for(const profile of ['current','balanced'])assert.equal((await setup({runtime:{profile}}).route.GET(request({profile,mediation:'standard'}))).status,400);
  for(const placement of ['interstitial','slider','popunder']){
    const api=setup({runtime:{profile:'intensive'}});assert.equal((await api.route.GET(request({profile:'intensive',placement,mediation:'alternative'}))).status,400);assert.equal(api.reads(),0);
  }
  const duplicate=new URL(request({...changes,mediation:'alternative'}).url);duplicate.searchParams.append('mediation','standard');
  assert.equal((await setup({runtime:{profile:'intensive'}}).route.GET(new Request(duplicate))).status,400);
  for(const cookie of [null,'v1:accepted','v2:refused']){
    const api=setup({cookie,runtime:{profile:'intensive'}});
    assert.equal((await api.route.GET(request({...changes,mediation:'alternative'}))).status,403);assert.equal(api.reads(),0);
  }
  for(const denied of [{enabled:false},{effectiveEnabled:false},{reason:'owner'},{reason:'premium'},
    {placements:{...placements,feed:false}}])assert.equal((await setup({runtime:{profile:'intensive',...denied}}).route.GET(request({...changes,mediation:'alternative'}))).status,403);
});

test("TS-selected positions and stale profiles cannot request an Exo document", async () => {
  for (const changes of [{ placement: "header" }, { placement: "underVideo" }, { profile: "balanced" }]) assert.equal((await setup().route.GET(request(changes))).status, 403);
  assert.equal((await setup({ runtime: { profile: "balanced" } }).route.GET(request({ profile: "balanced", placement: "feed", path: "/feed", ordinal: "0" }))).status, 403);
});

test("v2 consent and every current runtime gate remain mandatory, including owner/Premium exclusion", async () => {
  for (const cookie of [null, "v1:accepted", "v1:refused", "v2:refused", "%broken"]) {
    const api = setup({ cookie }); assert.equal((await api.route.GET(request())).status, 403); assert.equal(api.reads(), 0);
  }
  for (const denied of [{ enabled: false }, { effectiveEnabled: false }, { reason: "owner" }, { reason: "premium" }, { reason: "unavailable" }, { consent: null }, { profile: null }, { placements: { ...placements, footer: false } }]) assert.equal((await setup({ runtime: denied }).route.GET(request())).status, 403);
});

test("query fields, nonce, locale, ordinal, public path and context are exact and never select arbitrary vendor input", async () => {
  for (const changes of [
    { zoneId: "6074788" }, { tagUrl: "https://attacker.test" }, { locale: "fr-FR" }, { locale: null }, { nonce: "bad<script>" }, { nonce: "x".repeat(101) },
    { device: "tablet" }, { context: "video" }, { placement: "slider" }, { profile: "unknown" }, { ordinal: "1" },
    { path: "//attacker.test" }, { path: "/fr/admin/ads" }, { path: "/api/readyz" }, { path: "/premium" }, { path: "/fr/ja/models" },
    { path: "/creator%2Fbad/123" }, { path: "/sample/../premium" }, { path: "/sample/123?token=x" }, { path: "/models#part" },
    { placement: "feed", path: "/feed" }, { placement: "feed", path: "/models", ordinal: "1" }, { placement: "feed", path: "/feed", ordinal: "01" },
    { placement: "underVideo", context: "pause", path: "/models" }, { placement: "footer", path: "/feed" },
  ]) {
    const response = await setup().route.GET(request(changes)); assert.equal(response.status, 400, JSON.stringify(changes)); assert.equal(await response.text(), "");
  }
  const duplicate = request(); const url = new URL(duplicate.url); url.searchParams.append("nonce", "other"); assert.equal((await setup().route.GET(new Request(url))).status, 400);
  assert.equal((await setup().route.GET(request({ path: "/tag/portrait" }))).status, 200);
});

test("foreign origins and cross-site embedders fail closed while exact local QA origins remain usable", async () => {
  for (const origin of ["https://attacker.test", "http://leakfanhub.com", "https://leakfanhub.com:444"]) assert.equal((await setup().route.GET(request({}, {}, origin))).status, 403);
  for (const headers of [{ origin: "https://attacker.test" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }]) assert.equal((await setup().route.GET(request({}, headers))).status, 403);
  for (const origin of ["http://127.0.0.1:3028", "http://localhost:3028"]) assert.equal((await setup().route.GET(request({}, {}, origin))).status, 200);
});

test('the actual Host selects the fixed parent origin behind Next internal URLs without trusting arbitrary hosts',async()=>{
  const local=await setup().route.GET(request({}, {host:'127.0.0.1:3029'}, 'http://localhost:3029'));
  assert.equal(local.status,200);assert.match(await local.text(),/"parentOrigin":"http:\/\/127.0.0.1:3029"/);
  const production=await setup().route.GET(request({}, {host:'leakfanhub.com'}, 'http://localhost:3000'));
  assert.equal(production.status,200);assert.match(await production.text(),/"parentOrigin":"https:\/\/leakfanhub.com"/);
  for(const host of ['attacker.test','leakfanhub.com.attacker.test','user@leakfanhub.com','leakfanhub.com/path','leakfanhub.com:444'])assert.equal((await setup().route.GET(request({}, {host}))).status,403,host);
});

test("missing registry readiness and backend exceptions disclose no internal error or vendor document", async () => {
  for (const options of [{ missingSpot: true }, { unavailable: true }]) {
    const response = await setup(options).route.GET(request()); assert.equal(response.status, 503); assert.equal(await response.text(), "");
  }
});
