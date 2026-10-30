#!/usr/bin/env node

import mysql from "mysql2/promise";

function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

function previousUtcDay(day) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return utcDay(date);
}

function requestedDay() {
  const argument = process.argv.slice(2).find((value) => !value.startsWith("--"));
  const day = argument ?? utcDay(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error("date_must_be_yyyy_mm_dd");
  }
  return day;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("analytics-report: DATABASE_URL is required");
  process.exit(1);
}

let connection;
try {
  const day = requestedDay();
  const yesterday = previousUtcDay(day);
  connection = await mysql.createConnection(databaseUrl);

  const [[accounts]] = await connection.query(
    "SELECT COUNT(*) AS registered_accounts FROM users",
  );
  const [[sessions]] = await connection.query(
    `SELECT COUNT(*) AS unexpired_sessions,
            COUNT(DISTINCT user_id) AS accounts_with_unexpired_session
     FROM sessions
     WHERE expires_at > UTC_TIMESTAMP()`,
  );
  const [days] = await connection.query(
    `SELECT day,
            COUNT(*) AS unique_visitors,
            COALESCE(SUM(page_views), 0) AS page_views
     FROM analytics_daily_visitors
     WHERE day IN (?, ?)
     GROUP BY day
     ORDER BY day`,
    [yesterday, day],
  );
  const [[presence]] = await connection.query(
    `SELECT COUNT(*) AS visitors_active_5m
     FROM analytics_presence
     WHERE last_seen_at >= UTC_TIMESTAMP(6) - INTERVAL 5 MINUTE`,
  );

  const dailyByDate = Object.fromEntries(
    days.map((row) => [
      typeof row.day === "string" ? row.day.slice(0, 10) : utcDay(row.day),
      {
        unique_visitors: Number(row.unique_visitors),
        page_views: Number(row.page_views),
      },
    ]),
  );
  const report = {
    measured_at_utc: new Date().toISOString(),
    definitions: {
      registered_accounts: "all account rows",
      unexpired_sessions: "login credentials valid for up to 30 days; not people online",
      visitors_active_5m: "anonymous visitor heartbeats seen in the last five minutes",
      daily: "first-party anonymous visitors and page views by UTC day",
    },
    registered_accounts: Number(accounts.registered_accounts),
    unexpired_sessions: Number(sessions.unexpired_sessions),
    accounts_with_unexpired_session: Number(
      sessions.accounts_with_unexpired_session,
    ),
    visitors_active_5m: Number(presence.visitors_active_5m),
    daily: {
      [yesterday]: dailyByDate[yesterday] ?? { unique_visitors: 0, page_views: 0 },
      [day]: dailyByDate[day] ?? { unique_visitors: 0, page_views: 0 },
    },
  };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(
    `analytics-report: ${(error && error.code) || (error && error.message) || "failed"}`,
  );
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}

