import "server-only";
import { stat } from "node:fs/promises";
import { open, type CountryResponse, type Reader } from "maxmind";
import { createCountryIpResolver, normalizeCountryCode } from "./analytics-country-policy";

const resolveIp = createCountryIpResolver(process.env.ANALYTICS_TRUSTED_PROXY_CIDRS ?? "");
let reader: Reader<CountryResponse> | null = null;
let mtime = 0;
let nextCheck = 0;
let loading: Promise<void> | null = null;
let nextWarning = 0;

/** Local lookup: no visitor address is stored or sent to a GeoIP API. */
export async function analyticsCountry(headers: Pick<Headers, "get">): Promise<string | null> {
  const path = process.env.ANALYTICS_COUNTRY_DB;
  const ip = resolveIp(headers);
  if (!path || !ip) return null;
  if (Date.now() >= nextCheck && !loading) {
    nextCheck = Date.now() + 60_000;
    loading = (async () => {
      try {
        const info = await stat(path);
        if (!reader || info.mtimeMs !== mtime) {
          const candidate = await open<CountryResponse>(path, { cache: { max: 1000 } });
          reader = candidate;
          mtime = info.mtimeMs;
        }
      } catch {
        // Retain the last validated database on update failure. A missing
        // initial database produces unknown country, not lost page views.
        if (Date.now() >= nextWarning) {
          console.warn(JSON.stringify({ event: "analytics_country_database_unavailable", retained_reader: !!reader }));
          nextWarning = Date.now() + 300_000;
        }
      }
    })().finally(() => { loading = null; });
  }
  if (loading) await loading;
  try { return normalizeCountryCode(reader?.get(ip)?.country?.iso_code); }
  catch { return null; }
}
