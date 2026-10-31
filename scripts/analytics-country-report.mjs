#!/usr/bin/env node
import mysql from "mysql2/promise";
import { COUNTRY_REPORT_SQL, countrySummary, countryReportHtml } from "./analytics-country-summary.mjs";

let connection;
try {
  if (!process.env.DATABASE_URL) throw Error("database_not_configured");
  if (process.argv.slice(2).some((v) => v !== "--html")) throw Error("usage_analytics_country_report_optional_html");
  connection = await mysql.createConnection(process.env.DATABASE_URL);
  await connection.query("SET SESSION time_zone = '+00:00'");
  await connection.query("SET SESSION max_statement_time = 10");
  await connection.query("START TRANSACTION READ ONLY");
  const [[time]] = await connection.query("SELECT UTC_TIMESTAMP(6) AS end_utc, UTC_TIMESTAMP(6) - INTERVAL 24 HOUR AS start_utc");
  const [rows] = await connection.execute(COUNTRY_REPORT_SQL, [time.start_utc, time.end_utc, time.start_utc, time.end_utc]);
  const [[tracking]] = await connection.query("SELECT MIN(country_observed_at) AS first_country_observation FROM analytics_daily_visitors");
  await connection.rollback();
  const report = {
    start_utc: time.start_utc, end_utc: time.end_utc,
    first_country_observation_utc: tracking.first_country_observation,
    definition: "Unique browser cookie IDs active in the rolling 24-hour window; not certified humans. One country per ID, using its most recent known daily observation; unknown is included in the denominator.",
    geolocation: { provider: "DB-IP Country Lite", attribution_url: "https://db-ip.com", license: "CC BY 4.0" },
    ...countrySummary(rows),
  };
  console.log(process.argv.includes("--html") ? countryReportHtml(report) : JSON.stringify(report, null, 2));
} catch (error) {
  console.error(`analytics-country-report: ${error?.code || "failed"}`);
  process.exitCode = 1;
} finally { if (connection) await connection.end(); }
