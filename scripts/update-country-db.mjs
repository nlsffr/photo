#!/usr/bin/env node
// Run as a maintenance job with a writable GeoIP directory. The web app mounts
// that directory read-only. No visitor data is read by this updater.
import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { Reader } from "maxmind";

const path = process.env.ANALYTICS_COUNTRY_DB;
if (!path) throw Error("ANALYTICS_COUNTRY_DB_required");
const month = new Date().toISOString().slice(0, 7);
const manifestPath = `${path}.json`;
const validate = (data) => {
  const reader = new Reader(data);
  if (!reader.metadata.databaseType.toLowerCase().includes("country")) throw Error("not_country_database");
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
    if (!/^[A-Z]{2}$/.test(reader.get(ip)?.country?.iso_code ?? "")) throw Error("country_database_validation_failed");
  }
};
let fresh = false;
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const data = await readFile(path);
  validate(data);
  fresh = manifest.release === month && manifest.sha256 === createHash("sha256").update(data).digest("hex");
} catch { /* first install or damaged file: download and validate again */ }
if (fresh) {
  console.log(JSON.stringify({ event: "country_database_current", release: month }));
} else {
  const url = `https://download.db-ip.com/free/dbip-country-lite-${month}.mmdb.gz`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !response.body) throw Error(`country_database_download_http_${response.status}`);
  const parts = []; let bytes = 0;
  for await (const part of response.body) {
    bytes += part.length;
    if (bytes > 20_000_000) throw Error("country_database_download_too_large");
    parts.push(part);
  }
  const data = gunzipSync(Buffer.concat(parts), { maxOutputLength: 40_000_000 });
  validate(data);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temp, data, { flag: "wx", mode: 0o644 });
    await rename(temp, path);
  } finally { await rm(temp, { force: true }); }
  await writeFile(manifestPath, JSON.stringify({
    release: month, updated_at: new Date().toISOString(), bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    source: url, attribution: "IP Geolocation by DB-IP — https://db-ip.com", license: "CC BY 4.0",
  }, null, 2) + "\n", { mode: 0o644 });
  console.log(JSON.stringify({ event: "country_database_updated", release: month, bytes: data.length }));
}
