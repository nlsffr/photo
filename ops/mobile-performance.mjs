#!/usr/bin/env node
// Isolated synthetic measurements; no dependency or instrumentation in the site.
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const help = `Usage: node run-mobile-lab.mjs --base https://leakfanhub.com --output after.json [--runs 3] [--dpr 2] [--channel chrome]
Measures /, /models and /alexapearl sequentially in fresh Chromium contexts.
390×844, touch/mobile viewport, cold browser cache, 1.6 Mbps / 150 ms, CPU 4×,
refused audience cookie, 8 seconds after DOMContentLoaded. No clicks or media playback.
Set PLAYWRIGHT_MODULE to an existing absolute playwright/index.mjs path if it is
not installed in the lab directory. No package is installed or changed by this script.
Do not compare lab INP with field INP: this script performs no interaction.`;
if (process.argv.includes('--help')) { console.log(help); process.exit(0); }
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--base', '--output', '--runs', '--dpr', '--channel'].includes(args[i]) || !args[i + 1]) throw Error(help);
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.base || !options.output) throw Error(help);
if (existsSync(resolve(options.output))) throw Error('Output already exists; choose a new evidence filename.');
const base = new URL(options.base);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw Error('Use a plain HTTP(S) origin without credentials.');
const runs = Number(options.runs ?? 3), dpr = Number(options.dpr ?? 2);
if (!Number.isInteger(runs) || runs < 1 || runs > 5 || ![1, 2, 3].includes(dpr)) throw Error('runs must be 1–5 and dpr 1, 2 or 3.');
let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright'));
} catch { throw Error('Playwright lab module unavailable. Set PLAYWRIGHT_MODULE to an existing playwright/index.mjs; no production dependency is needed.'); }
const settings = {
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: dpr, locale: 'en-US',
  network: { offline: false, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8, latency: 150 },
  cpuThrottlingRate: 4, observationMs: 8000, browserCache: 'disabled; fresh context per sample',
  serviceWorkers: 'block', consent: 'refused', ageGate: 'lumen_age_ok=1', interactions: 'none',
};
const browser = await chromium.launch({ headless: true, ...(options.channel ? { channel: options.channel } : {}) });
const samples = [];
try {
  for (const path of ['/', '/models', '/alexapearl']) for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({ viewport: settings.viewport, isMobile: settings.isMobile, hasTouch: settings.hasTouch, deviceScaleFactor: dpr, locale: settings.locale, serviceWorkers: 'block' });
    let cdp;
    try {
      // This sets only the lab visitor's refused preference, before any page load.
      await context.addCookies([{ name: 'lfh_audience', value: 'refused', url: base.origin, sameSite: 'Lax', secure: base.protocol === 'https:' }]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => { if (errors.length < 8) errors.push({ name: error.name, message: error.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 180) }); });
      cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', settings.network);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: settings.cpuThrottlingRate });
      await page.addInitScript(() => {
        try { localStorage.setItem('lumen_age_ok', '1'); } catch { /* Storage can be unavailable on non-page contexts. */ }
        const lab = window.__mobileLab = { lcp: null, lcpElement: null, cls: 0, longTasks: 0, longTaskMs: 0, maxLongTaskMs: 0, supported: {} };
        const observe = (type, callback, extra = {}) => {
          try { new PerformanceObserver(callback).observe({ type, buffered: true, ...extra }); lab.supported[type] = true; }
          catch { lab.supported[type] = false; }
        };
        observe('largest-contentful-paint', (list) => {
          const entry = list.getEntries().at(-1), element = entry?.element;
          if (!entry) return;
          lab.lcp = entry.startTime;
          lab.lcpElement = element ? { tag: element.tagName, imageIndex: [...document.images].indexOf(element), loading: element.getAttribute('loading'), fetchPriority: element.getAttribute('fetchpriority'), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height } : null;
        });
        let sessionValue = 0, sessionStart = 0, lastShift = 0;
        observe('layout-shift', (list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) {
            if (!sessionStart || entry.startTime - lastShift > 1000 || entry.startTime - sessionStart > 5000) { sessionStart = entry.startTime; sessionValue = 0; }
            lastShift = entry.startTime; sessionValue += entry.value; lab.cls = Math.max(lab.cls, sessionValue);
          }
        });
        observe('longtask', (list) => {
          for (const entry of list.getEntries()) { lab.longTasks++; lab.longTaskMs += entry.duration; lab.maxLongTaskMs = Math.max(lab.maxLongTaskMs, entry.duration); }
        });
      });
      const response = await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(settings.observationMs);
      const data = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return {
          ...window.__mobileLab, ttfb: nav ? nav.responseStart - nav.requestStart : null,
          domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
          transferred: (nav?.transferSize ?? 0) + performance.getEntriesByType('resource').reduce((sum, entry) => sum + (entry.transferSize ?? 0), 0),
          highPriorityImages: [...document.images].filter((img) => img.getAttribute('fetchpriority') === 'high').length,
          images: [...document.images].slice(0, 24).map((img) => ({ loading: img.loading, fetchPriority: img.fetchPriority, complete: img.complete, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height })),
        };
      });
      samples.push({ path, run, observedAt: new Date().toISOString(), status: response?.status() ?? null, ...data, errors });
      console.log(`${path} run ${run}: HTTP ${response?.status() ?? 'none'}, LCP ${data.lcp?.toFixed(0) ?? 'unknown'} ms, high images ${data.highPriorityImages}`);
    } finally { if (cdp) await cdp.detach().catch(() => {}); await context.close(); }
  }
} finally { await browser.close(); }
const numeric = (values) => values.filter((n) => typeof n === 'number' && Number.isFinite(n));
const median = (values) => { const numbers = numeric(values).sort((a, b) => a - b), middle = Math.floor(numbers.length / 2); return !numbers.length ? null : numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2; };
const bounds = (values) => { const numbers = numeric(values); return { lcpMin: numbers.length ? Math.min(...numbers) : null, lcpMax: numbers.length ? Math.max(...numbers) : null }; };
const result = {
  collectedAt: new Date().toISOString(), origin: base.origin, browser: browser.version(), settings,
  caveat: 'Synthetic foreground samples only. No field p75, no interaction/INP. CDN/server cache is not purged. Compare identical settings and report variance, not a single-run gain.',
  summary: ['/', '/models', '/alexapearl'].map((path) => { const rows = samples.filter((row) => row.path === path); return { path, runs: rows.length, lcpMedian: median(rows.map((row) => row.lcp)), ...bounds(rows.map((row) => row.lcp)), ttfbMedian: median(rows.map((row) => row.ttfb)), clsMax: Math.max(...rows.map((row) => row.cls)), httpAll200: rows.every((row) => row.status === 200) }; }),
  samples,
};
await writeFile(resolve(options.output), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
console.log(`Saved metadata only to ${resolve(options.output)}`);
