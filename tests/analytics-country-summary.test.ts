import assert from "node:assert/strict";
import test from "node:test";
import { countrySummary, countryReportHtml } from "../scripts/analytics-country-summary.mjs";

test("percentages include unknown visitors and show every country", () => {
  const report = countrySummary([{ country_code: "FR", visitor_ids: "30" }, { country_code: "US", visitor_ids: 20 }, { country_code: null, visitor_ids: 50 }]);
  assert.equal(report.visitor_ids, 100);
  assert.equal(report.coverage_percent, 50);
  assert.equal(report.countries[0].percent_of_all_visitors, 30);
  assert.equal(report.countries[0].country, "France");
  assert.equal(report.countries[2].country, "Inconnu");
  assert.equal(countrySummary([]).coverage_percent, 0);
});

test("the standalone report escapes labels and includes geolocation attribution", () => {
  const html = countryReportHtml({start_utc:"2026-10-30T20:00:00Z",end_utc:"2026-10-31T20:00:00Z",visitor_ids:1,coverage_percent:100,countries:[{country:'<script>bad</script>',visitor_ids:1,percent_of_all_visitors:100}]});
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("https://db-ip.com"));
  assert.ok(html.includes("Inconnu"));
});
