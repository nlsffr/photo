import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native type stripping requires the explicit .ts suffix.
import { createCountryIpResolver, normalizeCountryCode } from "../src/lib/analytics-country-policy.ts";

const resolve = createCountryIpResolver("186.2.160.0/24,186.2.167.0/24");
const headers = (peer: string, chain: string) => new Headers({
  "x-real-ip": peer, "x-forwarded-for": chain,
});

test("country lookup uses the rightmost untrusted hop, ignoring a forged prefix", () => {
  assert.equal(resolve(headers("186.2.160.10", "8.8.8.8, 186.2.160.10")), "8.8.8.8");
  assert.equal(resolve(headers("186.2.160.10", "1.1.1.1, 8.8.8.8, 186.2.167.20, 186.2.160.10")), "8.8.8.8");
});

test("an untrusted peer, missing proxy suffix, or malformed chain stays unknown", () => {
  assert.equal(resolve(headers("8.8.8.8", "1.1.1.1, 8.8.8.8")), null);
  assert.equal(resolve(headers("186.2.160.10", "1.1.1.1")), null);
  assert.equal(resolve(headers("186.2.160.10", "1.1.1.1, invalid, 186.2.160.10")), null);
  assert.equal(createCountryIpResolver("")(headers("186.2.160.10", "8.8.8.8, 186.2.160.10")), null);
  assert.equal(createCountryIpResolver("broken")(headers("186.2.160.10", "8.8.8.8, 186.2.160.10")), null);
});

test("private and documentation addresses never become a country", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "100.64.1.2", "192.168.1.1", "203.0.113.1", "::1", "fc00::1", "fe80::1", "2001:db8::1"]) {
    assert.equal(resolve(headers("186.2.160.10", `${ip}, 186.2.160.10`)), null, ip);
  }
});

test("IPv6 and IPv4-mapped addresses are supported", () => {
  assert.equal(resolve(headers("186.2.160.10", "2606:4700:4700::1111, 186.2.160.10")), "2606:4700:4700::1111");
  assert.equal(resolve(headers("::ffff:186.2.160.10", "::ffff:8.8.8.8, ::ffff:186.2.160.10")), "8.8.8.8");
});

test("unknown pseudo-country codes remain unknown", () => {
  assert.equal(normalizeCountryCode("fr"), "FR");
  for (const code of [undefined, "", "ZZ", "EU", "AP", "A1", "France"]) assert.equal(normalizeCountryCode(code), null);
});
