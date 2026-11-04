import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
// @ts-expect-error Native Node requires explicit suffixes.
import { buildExoclickBannerDocument } from "../src/lib/exoclick-banner.ts";

const options = {
  placement: "header" as const,
  spot: { zoneId: 6074782, width: 728, height: 90 },
  parentOrigin: "https://leakfanhub.com",
  consentValue: "v2:accepted" as const,
  nonce: "header_current_11",
  labels: { advertisement: "Advertisement", unavailable: "Advertisement unavailable" },
};

type Frame = { src?: string; width?: string; height?: string; title?: string; referrerPolicy?: string; onload?: () => void; onerror?: () => void; attrs: Record<string, string>; removed: boolean; setAttribute: (key: string, value: string) => void; remove: () => void };
function bootstrap(settings: { cookie?: string; hidden?: boolean; origin?: string; standalone?: boolean } = {}) {
  const { html } = buildExoclickBannerDocument(options);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]; assert.ok(script);
  const frames: Frame[] = [], messages: Array<{ payload: { type: string; placement: string; nonce: string; status: string }; origin: string }> = [];
  const root = { hidden: true, appendChild: (frame: Frame) => { frames.push(frame); } };
  const fallback = { hidden: true };
  const document = Object.assign(new EventTarget(), {
    cookie: settings.cookie ?? "lfh_ad_consent=v2%3Aaccepted", visibilityState: settings.hidden ? "hidden" : "visible",
    getElementById: (id: string) => id === "lfh-exo" ? root : fallback,
    createElement: (tag: string) => {
      assert.equal(tag, "iframe");
      const frame: Frame = { attrs: {}, removed: false, setAttribute(key, value) { this.attrs[key] = value; }, remove() { this.removed = true; } };
      return frame;
    },
  });
  const window = new EventTarget();
  const parent = settings.standalone ? window : { postMessage: (payload: typeof messages[number]["payload"], origin: string) => { messages.push({ payload, origin }); } };
  let timer = 0;
  const timers = new Map<number, () => void>();
  runInNewContext(script, {
    document, window, parent, location: { origin: settings.origin ?? options.parentOrigin },
    setTimeout: (callback: () => void) => { const id = ++timer; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const visibility = (visible: boolean, extra: Record<string, unknown> = {}, origin = options.parentOrigin, source: unknown = parent) => {
    const event = new Event("message");
    Object.assign(event, { data: { type: "lfh-ad-visibility", placement: "header", nonce: options.nonce, visible, ...extra }, origin, source });
    window.dispatchEvent(event);
  };
  return { document, window, parent, frames, messages, root, fallback, visibility,
    fireTimers: () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
  };
}

test("the document uses the official exact iframe URL, narrow CSP and hashed script/style", () => {
  const document = buildExoclickBannerDocument(options);
  const script = document.html.match(/<script>([\s\S]*?)<\/script>/)?.[1]; assert.ok(script);
  const style = document.html.match(/<style>([\s\S]*?)<\/style>/)?.[1]; assert.ok(style);
  assert.ok(document.csp.includes(`script-src 'sha256-${createHash("sha256").update(script).digest("base64")}'`));
  assert.ok(document.csp.includes(`style-src 'sha256-${createHash("sha256").update(style).digest("base64")}'`));
  assert.match(document.csp, /frame-src https:\/\/a\.magsrv\.com(?:;|$)/);
  assert.match(document.csp, /frame-ancestors 'self'/);
  assert.doesNotMatch(document.csp, /unsafe-inline|\*|(?:script|connect|frame|img|media)-src https:(?:;|$)/);
  assert.doesNotMatch(document.html, /<iframe|<script[^>]+src=|preconnect|document\.write|window\.open/);
});

test("unregistered-looking inputs cannot inject a zone, origin, dimensions, placement, consent or nonce", () => {
  for (const changes of [
    { placement: "feed" }, { spot: { ...options.spot, zoneId: 0 } }, { spot: { ...options.spot, zoneId: 1.5 } },
    { spot: { ...options.spot, zoneId: "6074782&bad=1" } }, { spot: { ...options.spot, width: 300, height: 90 } },
    { parentOrigin: "https://leakfanhub.com.attacker.test" }, { parentOrigin: "https://attacker.test" },
    { parentOrigin: "https://leakfanhub.com/path" }, { parentOrigin: "https://user@leakfanhub.com" },
    { parentOrigin: "http://leakfanhub.com" }, { parentOrigin: "https://leakfanhub.com:444" },
    { consentValue: "v1:accepted" }, { consentValue: "v2:refused" }, { nonce: "<script>" }, { nonce: "a".repeat(101) },
  ]) assert.throws(() => buildExoclickBannerDocument({ ...options, ...changes } as never), /invalid_exoclick_banner/);
  for (const parentOrigin of ["http://127.0.0.1:3028", "http://localhost:3028"]) assert.ok(buildExoclickBannerDocument({ ...options, parentOrigin }).html);
  for (const [width, height] of [[728, 90], [300, 250], [300, 100]]) assert.ok(buildExoclickBannerDocument({ ...options, spot: { ...options.spot, width, height } }).html);
});

test("localized labels are text and cannot terminate the document or fixed bootstrap", () => {
  const html = buildExoclickBannerDocument({ ...options, labels: { advertisement: '</title><script>attack()</script>', unavailable: '<img src=x onerror="attack()">' } }).html;
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.doesNotMatch(html, /<img|<script>attack|onerror="attack/);
  assert.match(html, /&lt;\/title&gt;/);
});

test("accepted consent alone never creates an iframe before a matching parent visibility message", () => {
  const ui = bootstrap(); assert.equal(ui.frames.length, 0); assert.equal(ui.root.hidden, true); assert.equal(ui.messages.length, 0);
  ui.visibility(true, {}, "https://attacker.test"); ui.visibility(true, {}, "null"); ui.visibility(true, {}, options.parentOrigin, {});
  ui.visibility(true, { nonce: "old-frame" }); ui.visibility(true, { placement: "footer" }); ui.visibility(true, { visible: "true" });
  assert.equal(ui.frames.length, 0);
  ui.visibility(true); assert.equal(ui.frames.length, 1);
  assert.equal(ui.frames[0].src, "https://a.magsrv.com/iframe.php?idzone=6074782&size=728x90");
  assert.equal(ui.frames[0].referrerPolicy, "strict-origin-when-cross-origin");
  assert.equal(ui.frames[0].attrs.sandbox, "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
  assert.doesNotMatch(ui.frames[0].attrs.sandbox, /top-navigation|allow-forms/);
});

test("visibility waits for the document and scrolling never rearms another impression", () => {
  const ui = bootstrap({ hidden: true }); ui.visibility(true); assert.equal(ui.frames.length, 0);
  ui.document.visibilityState = "visible"; ui.document.dispatchEvent(new Event("visibilitychange")); assert.equal(ui.frames.length, 1);
  ui.visibility(false); assert.equal(ui.root.hidden, true);
  ui.visibility(true); ui.visibility(true); assert.equal(ui.frames.length, 1); assert.equal(ui.root.hidden, false);
});

test("refused, absent, old or malformed consent cannot start a vendor request", () => {
  for (const cookie of ["", "lfh_audience=accepted", "lfh_ad_consent=v1:accepted", "lfh_ad_consent=v2:refused", "lfh_ad_consent=%broken"]) {
    const ui = bootstrap({ cookie }); ui.visibility(true); assert.equal(ui.frames.length, 0, cookie);
    assert.equal(ui.messages[0]?.payload.status, "empty");
  }
});

test("a consent refusal disposes an existing iframe without a later remount", () => {
  const ui = bootstrap(); ui.visibility(true); const frame = ui.frames[0];
  ui.document.cookie = "lfh_ad_consent=v2%3Arefused"; ui.visibility(false);
  assert.equal(frame.removed, true); assert.equal(ui.root.hidden, true);
  ui.document.cookie = "lfh_ad_consent=v2%3Aaccepted"; ui.visibility(true);
  assert.equal(ui.frames.length, 1);
});

test("loaded reports only one correlated iframe load, without claiming a filled creative", () => {
  const ui = bootstrap(); ui.visibility(true); ui.frames[0].onload?.(); ui.frames[0].onload?.(); ui.fireTimers();
  assert.equal(ui.messages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(ui.messages[0])), { payload: { type: "lfh-ad-status", placement: "header", nonce: options.nonce, status: "loaded" }, origin: options.parentOrigin });
  assert.ok(ui.messages.every(message => message.payload.status !== "filled"));
});

for (const outcome of ["error", "timeout"] as const) {
  test(`${outcome} disposes the iframe, sends one empty status and ignores a late load`, () => {
    const ui = bootstrap(); ui.visibility(true); const frame = ui.frames[0];
    if (outcome === "error") frame.onerror?.(); else ui.fireTimers();
    frame.onload?.(); assert.equal(frame.removed, true); assert.equal(ui.messages.length, 1); assert.equal(ui.messages[0].payload.status, "empty");
    assert.equal(ui.messages[0].payload.nonce, options.nonce); ui.visibility(false); ui.visibility(true); assert.equal(ui.frames.length, 1);
  });
}

test("pagehide cleans up the child and top-level or mismatched-origin documents cannot start it", () => {
  const ui = bootstrap(); ui.visibility(true); ui.window.dispatchEvent(new Event("pagehide"));
  assert.equal(ui.frames[0].removed, true); ui.visibility(true); assert.equal(ui.frames.length, 1);
  for (const settings of [{ standalone: true }, { origin: "https://attacker.test" }]) {
    const isolated = bootstrap(settings); isolated.visibility(true); assert.equal(isolated.frames.length, 0);
  }
});

test("a back-forward cache return reuses one frame and rechecks a refusal before displaying it", () => {
  const ui = bootstrap(); ui.visibility(true);
  const cached = new Event("pagehide"); Object.assign(cached, { persisted: true }); ui.window.dispatchEvent(cached);
  assert.equal(ui.root.hidden, true); assert.equal(ui.frames[0].removed, false);
  ui.window.dispatchEvent(new Event("pageshow")); assert.equal(ui.root.hidden, false); assert.equal(ui.frames.length, 1);
  ui.window.dispatchEvent(cached); ui.document.cookie = "lfh_ad_consent=v2:refused";
  ui.window.dispatchEvent(new Event("pageshow")); assert.equal(ui.frames[0].removed, true); assert.equal(ui.root.hidden, true);
});
